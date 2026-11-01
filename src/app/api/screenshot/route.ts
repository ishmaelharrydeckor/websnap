import { timingSafeEqual } from "node:crypto";
import { captureScreenshot, CaptureError } from "@/server/screenshot/capture";
import { parseCaptureOptions } from "@/server/screenshot/config";
import { getScreenshot } from "@/server/screenshot/instance";
import { checkUrl } from "@/server/screenshot/ssrf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function tokenOk(header: string | null, expected: string): boolean {
  const given = Buffer.from(header?.replace(/^Bearer\s+/i, "") ?? "");
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

/** Tells the editor whether "screenshot a URL" is available here. */
export async function GET() {
  const { cfg } = getScreenshot();
  return json({ enabled: cfg.enabled, requiresToken: Boolean(cfg.token) });
}

/** Takes a screenshot of a public web page and returns it as a PNG. */
export async function POST(request: Request) {
  const { cfg, limiter, queue } = getScreenshot();
  if (!cfg.enabled) return json({ error: "Screenshots of web addresses are not enabled on this server." }, 404);
  if (cfg.token && !tokenOk(request.headers.get("authorization"), cfg.token)) return json({ error: "A valid token is required." }, 401);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (!limiter.allow(ip)) return json({ error: "Too many screenshots. Try again later." }, 429);

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== "object" || parsed === null) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "The request couldn't be read." }, 400);
  }
  if (typeof body.url !== "string" || body.url.length > 2048) return json({ error: "Enter a web address." }, 400);
  const checked = checkUrl(body.url.trim(), cfg.rules);
  if (!checked.ok) return json({ error: checked.error }, 400);

  try {
    const png = await queue.run(() => captureScreenshot(checked.url.href, parseCaptureOptions(body), cfg));
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (e) {
    if (e instanceof CaptureError) return json({ error: e.message }, e.status);
    return json({ error: "The screenshot failed." }, 500);
  }
}
