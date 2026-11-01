import http from "node:http";
import https from "node:https";
import { checkUrl, safeLookup, type UrlRules } from "./ssrf";

export interface FetchLimits {
  /** Largest response body we will read, in bytes. */
  maxBytes: number;
  timeoutMs: number;
}

export interface FetchedResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

/** Headers that describe one connection, not the content, and so are never copied through. */
const HOP_BY_HOP = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade", "host", "content-length", "content-encoding"]);

export class BlockedError extends Error {}

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

/**
 * Like safeRequest, but follows up to `maxRedirects` redirects itself (for images, scripts, styles and the like).
 * Every hop is checked on its own, exactly like the first request.
 */
export async function safeRequestFollowing(
  rawUrl: string,
  init: { method: string; headers: Record<string, string>; body?: Buffer },
  rules: UrlRules,
  limits: FetchLimits,
  maxRedirects = 5,
): Promise<FetchedResponse> {
  let url = rawUrl;
  let current = init;
  for (let hop = 0; ; hop++) {
    const res = await safeRequest(url, current, rules, limits);
    const location = res.headers["location"];
    if (!REDIRECT_CODES.has(res.status) || !location) return res;
    if (hop >= maxRedirects) throw new BlockedError("Too many redirects.");
    url = new URL(location, url).href;
    // 301/302/303 turn the request into a plain GET (as browsers do); 307/308 keep method and body.
    if (res.status !== 307 && res.status !== 308) current = { method: "GET", headers: init.headers };
  }
}

export function redirectTarget(res: FetchedResponse, from: string): string | undefined {
  const location = res.headers["location"];
  if (!REDIRECT_CODES.has(res.status) || !location) return undefined;
  try {
    return new URL(location, from).href;
  } catch {
    return undefined;
  }
}

/**
 * Fetches a URL on behalf of the headless browser. The URL is checked first, and the socket then only connects
 * to an address that passed the same check (see safeLookup). Redirects are not followed here: they are returned
 * to the browser, which asks again, so every hop is checked on its own.
 */
export function safeRequest(
  rawUrl: string,
  init: { method: string; headers: Record<string, string>; body?: Buffer },
  rules: UrlRules,
  limits: FetchLimits,
): Promise<FetchedResponse> {
  const checked = checkUrl(rawUrl, rules);
  if (!checked.ok) return Promise.reject(new BlockedError(checked.error));
  const { url } = checked;
  const mod = url.protocol === "https:" ? https : http;

  return new Promise((resolveRaw, rejectRaw) => {
    let settled = false;
    const resolve = (v: FetchedResponse) => {
      if (settled) return;
      settled = true;
      resolveRaw(v);
    };
    const reject = (e: unknown) => {
      if (settled) return;
      settled = true;
      rejectRaw(e);
    };
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(init.headers)) if (!HOP_BY_HOP.has(k.toLowerCase())) headers[k] = v;
    headers["accept-encoding"] = "identity"; // keep bodies plain so we can hand them back unchanged
    if (init.body) headers["content-length"] = String(init.body.length);

    const req = mod.request(
      url,
      { method: init.method, headers, lookup: safeLookup(rules) as never, timeout: limits.timeoutMs },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > limits.maxBytes) {
            reject(new BlockedError("The page sent more data than allowed."));
            req.destroy();
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => {
          const out: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (v === undefined || HOP_BY_HOP.has(k.toLowerCase())) continue;
            out[k] = Array.isArray(v) ? (k.toLowerCase() === "set-cookie" ? v.join("\n") : v.join(", ")) : v;
          }
          resolve({ status: res.statusCode ?? 502, headers: out, body: Buffer.concat(chunks) });
        });
        res.on("error", reject);
      },
    );
    req.on("timeout", () => {
      reject(new Error("The page took too long to answer."));
      req.destroy();
    });
    req.on("error", (e: NodeJS.ErrnoException) => reject(e.code === "EBLOCKED" ? new BlockedError(e.message) : e));
    if (init.body) req.write(init.body);
    req.end();
  });
}
