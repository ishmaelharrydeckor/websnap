import { readConfig, type ShareConfig } from "./config";
import { RateLimiter } from "./ratelimit";
import { ShareService } from "./service";

interface Instance {
  cfg: ShareConfig;
  /** Created on first use, and only when sharing is enabled, so a server with sharing off never touches the disk. */
  readonly service: ShareService;
  limiter: RateLimiter;
}

const g = globalThis as unknown as { __websnapShare?: Instance };

/** One service per server process (Next may load route modules several times in dev). */
export function getShare(): Instance {
  if (!g.__websnapShare) {
    const cfg = readConfig();
    let service: ShareService | undefined;
    g.__websnapShare = {
      cfg,
      get service() {
        if (!cfg.enabled) throw new Error("Sharing is not enabled");
        if (!service) {
          service = new ShareService(cfg);
          void service.purgeExpired().catch(() => {});
        }
        return service;
      },
      limiter: new RateLimiter(cfg.uploadsPerHour, 3600_000),
    };
  }
  return g.__websnapShare;
}

/** Headers for files we serve back. They are user content, so they can never run as a page. */
export const FILE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Cache-Control": "public, max-age=300",
} as const;
