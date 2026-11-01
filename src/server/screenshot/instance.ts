import { RateLimiter } from "../share/ratelimit";
import { Semaphore } from "./capture";
import { readScreenshotConfig, type ScreenshotConfig } from "./config";

interface Instance {
  cfg: ScreenshotConfig;
  limiter: RateLimiter;
  queue: Semaphore;
}

const g = globalThis as unknown as { __websnapShot?: Instance };

export function getScreenshot(): Instance {
  if (!g.__websnapShot) {
    const cfg = readScreenshotConfig();
    g.__websnapShot = { cfg, limiter: new RateLimiter(cfg.perHour, 3600_000), queue: new Semaphore(cfg.maxConcurrent) };
  }
  return g.__websnapShot;
}
