import type { Browser } from "playwright-core";
import { BlockedError, redirectTarget, safeRequest, safeRequestFollowing } from "./fetcher";
import { maxCaptureHeight, type CaptureOptions, type ScreenshotConfig } from "./config";
import { checkUrl } from "./ssrf";

export class CaptureError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

let browserPromise: Promise<Browser> | undefined;

async function getBrowser(cfg: ScreenshotConfig): Promise<Browser> {
  browserPromise ??= import("playwright-core").then(({ chromium }) =>
    chromium
      .launch({
        executablePath: cfg.chromiumPath,
        args: [
          "--no-sandbox", // containers rarely allow the sandbox; everything the page loads goes through our own checked fetcher instead
          "--disable-gpu",
          "--disable-dev-shm-usage",
          // Nothing should reach the network by itself: every http(s) request is answered by our fetcher, and
          // anything that slips past it can neither resolve a name nor reach a proxy.
          "--host-resolver-rules=MAP * ~NOTFOUND",
          "--proxy-server=http://127.0.0.1:9",
          "--proxy-bypass-list=<-loopback>",
          "--disable-background-networking",
        ],
      })
      .then((b) => {
        b.on("disconnected", () => (browserPromise = undefined));
        return b;
      }),
  );
  try {
    return await browserPromise;
  } catch (e) {
    browserPromise = undefined;
    throw e;
  }
}

/** Lets only `max` captures run at once; the rest wait in line. */
export class Semaphore {
  private waiting: (() => void)[] = [];
  private active = 0;
  constructor(private max: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((r) => this.waiting.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}

/** Opens a page in a throwaway browser context and returns a PNG of it. */
export async function captureScreenshot(rawUrl: string, opts: CaptureOptions, cfg: ScreenshotConfig): Promise<Buffer> {
  const first = checkUrl(rawUrl, cfg.rules);
  if (!first.ok) throw new CaptureError(first.error, 400);

  let browser: Browser;
  try {
    browser = await getBrowser(cfg);
  } catch {
    throw new CaptureError("The screenshot service couldn't start its browser.", 503);
  }
  const context = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: opts.scale,
    colorScheme: opts.dark ? "dark" : "light",
    acceptDownloads: false,
    serviceWorkers: "block",
    permissions: [],
  });

  let requests = 0;
  let bytes = 0;
  let mainBlocked: string | undefined;
  let mainStatus = 0;
  let pendingRedirect: string | undefined;

  try {
    await context.route("**/*", async (route) => {
      const req = route.request();
      if (++requests > cfg.maxRequests) return route.abort("blockedbyclient");
      const isMain = req.isNavigationRequest() && req.frame() === req.frame().page().mainFrame();
      const limits = { maxBytes: cfg.maxResponseBytes, timeoutMs: cfg.timeoutMs };
      const init = { method: req.method(), headers: await req.allHeaders(), body: req.postDataBuffer() ?? undefined };
      try {
        // The page itself is not redirected here: we note where it goes and open that address as a fresh,
        // checked navigation. Everything else is followed hop by hop inside the checked fetcher.
        const res = isMain ? await safeRequest(req.url(), init, cfg.rules, limits) : await safeRequestFollowing(req.url(), init, cfg.rules, limits);
        if (isMain) {
          const target = redirectTarget(res, req.url());
          if (target) {
            pendingRedirect = target;
            return await route.abort("aborted");
          }
          mainStatus = res.status;
        }
        bytes += res.body.length;
        if (bytes > cfg.maxResponseBytes * 3) return await route.abort("blockedbyclient");
        await route.fulfill({ status: res.status, headers: res.headers, body: res.body });
      } catch (e) {
        if (e instanceof BlockedError && isMain) mainBlocked = e.message;
        await route.abort(e instanceof BlockedError ? "blockedbyclient" : "failed").catch(() => {});
      }
    });

    const page = await context.newPage();
    await page.routeWebSocket(/.*/, (ws) => void ws.close()); // sockets don't go through our checked fetcher
    page.on("dialog", (d) => void d.dismiss());
    page.on("popup", (p) => void p.close());

    const deadline = Date.now() + cfg.timeoutMs;
    let target = first.url.href;
    for (let hop = 0; ; hop++) {
      pendingRedirect = undefined;
      mainBlocked = undefined;
      try {
        await page.goto(target, { waitUntil: "load", timeout: Math.max(1000, deadline - Date.now()) });
        break;
      } catch (e) {
        if (pendingRedirect) {
          if (hop >= 10) throw new CaptureError("The page redirected too many times.", 400);
          const next = checkUrl(pendingRedirect, cfg.rules);
          if (!next.ok) throw new CaptureError(next.error, 400);
          target = next.url.href;
          continue;
        }
        if (mainBlocked) throw new CaptureError(mainBlocked, 400);
        if (mainStatus >= 400) throw new CaptureError(`The site answered with an error (${mainStatus}).`);
        const msg = e instanceof Error ? e.message : "";
        if (/timeout/i.test(msg)) throw new CaptureError("The page took too long to load.", 504);
        throw new CaptureError("The page couldn't be loaded.", 502);
      }
    }
    // Give late content (fonts, lazy images) a short moment, but never past the deadline.
    await page.waitForLoadState("networkidle", { timeout: Math.max(0, Math.min(3000, deadline - Date.now())) }).catch(() => {});
    if (opts.fullPage) {
      const full = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0));
      await page.setViewportSize({ width: opts.width, height: Math.min(maxCaptureHeight(opts), Math.max(opts.height, full)) });
      await page.waitForTimeout(300);
    }
    return await page.screenshot({ type: "png" });
  } finally {
    await context.close().catch(() => {});
  }
}

export async function closeBrowser() {
  const b = await browserPromise?.catch(() => undefined);
  browserPromise = undefined;
  await b?.close().catch(() => {});
}
