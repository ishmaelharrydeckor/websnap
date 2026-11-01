import type { UrlRules } from "./ssrf";

export interface ScreenshotConfig {
  enabled: boolean;
  /** When set, requests must send `Authorization: Bearer <token>`. */
  token?: string;
  chromiumPath?: string;
  rules: UrlRules;
  perHour: number;
  maxConcurrent: number;
  timeoutMs: number;
  maxResponseBytes: number;
  maxRequests: number;
}

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) && n >= 0 ? n : fallback;
};

export function readScreenshotConfig(env: Record<string, string | undefined> = process.env): ScreenshotConfig {
  const ports = (env.SCREENSHOT_PORTS ?? "80,443")
    .split(",")
    .map((p) => Number(p.trim()))
    .filter((p) => Number.isInteger(p) && p > 0 && p < 65536);
  return {
    enabled: env.SCREENSHOT_ENABLED === "1" || env.SCREENSHOT_ENABLED === "true",
    token: env.SCREENSHOT_TOKEN || undefined,
    chromiumPath: env.SCREENSHOT_CHROMIUM_PATH || undefined,
    rules: { allowedPorts: ports.length ? ports : [80, 443], allowPrivate: env.SCREENSHOT_ALLOW_PRIVATE === "1" },
    perHour: num(env.SCREENSHOT_PER_HOUR, 10),
    maxConcurrent: Math.max(1, num(env.SCREENSHOT_MAX_CONCURRENT, 2)),
    timeoutMs: num(env.SCREENSHOT_TIMEOUT_S, 25) * 1000,
    maxResponseBytes: num(env.SCREENSHOT_MAX_RESPONSE_MB, 25) * 1048576,
    maxRequests: num(env.SCREENSHOT_MAX_REQUESTS, 200),
  };
}

export interface CaptureOptions {
  width: number;
  height: number;
  fullPage: boolean;
  dark: boolean;
  scale: 1 | 2;
}

export const MAX_FULL_PAGE_HEIGHT = 8000;
export const MAX_PIXELS = 30_000_000;

/** The tallest a full-page capture may be, so width x height x scale^2 stays inside the pixel budget. */
export function maxCaptureHeight(opts: Pick<CaptureOptions, "width" | "scale">): number {
  return Math.min(MAX_FULL_PAGE_HEIGHT, Math.floor(MAX_PIXELS / (opts.width * opts.scale * opts.scale)));
}

const clampInt = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
};

/** Turns whatever the client sent into safe capture settings. */
export function parseCaptureOptions(body: Record<string, unknown>): CaptureOptions {
  const width = clampInt(body.width, 320, 2560, 1440);
  const height = clampInt(body.height, 240, 2000, 900);
  const scale = body.scale === 2 ? 2 : 1;
  // Keep the final picture within a sane pixel budget.
  const tooBig = width * scale * height * scale > MAX_PIXELS;
  return { width, height, fullPage: body.fullPage === true, dark: body.dark === true, scale: tooBig ? 1 : scale };
}
