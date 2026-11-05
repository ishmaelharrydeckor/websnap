/**
 * Optional, privacy-friendly analytics. Off unless ANALYTICS_PROVIDER is set, so a self-hosted copy collects nothing by default.
 *
 *   ANALYTICS_PROVIDER   "umami" or "plausible"
 *   Umami:               UMAMI_WEBSITE_ID (required), UMAMI_SCRIPT_URL (default: Umami Cloud)
 *   Plausible:           PLAUSIBLE_DOMAIN (required), PLAUSIBLE_SCRIPT_URL (default: plausible.io)
 *
 * Read on the server when the page is built or served, so set these before `next build` / `next start`.
 */
export type AnalyticsProvider = "umami" | "plausible";

export interface AnalyticsConfig {
  provider: AnalyticsProvider;
  /** The provider's script. Always https. */
  src: string;
  /** Attributes the provider's script needs, for example the website id. */
  attrs: Record<string, string>;
}

type Env = Record<string, string | undefined>;

/** Only https scripts are accepted, so a typo or a bad value can't load something unexpected. */
function httpsUrl(value: string | undefined, fallback: string): string | null {
  const candidate = value?.trim() || fallback;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function analyticsConfig(env: Env = process.env): AnalyticsConfig | null {
  const provider = env.ANALYTICS_PROVIDER?.trim().toLowerCase();
  if (provider === "umami") {
    const id = env.UMAMI_WEBSITE_ID?.trim();
    const src = httpsUrl(env.UMAMI_SCRIPT_URL, "https://cloud.umami.is/script.js");
    if (!id || !src || !/^[\w-]{8,64}$/.test(id)) return null;
    return { provider, src, attrs: { "data-website-id": id, "data-do-not-track": "true" } };
  }
  if (provider === "plausible") {
    const domain = env.PLAUSIBLE_DOMAIN?.trim();
    const src = httpsUrl(env.PLAUSIBLE_SCRIPT_URL, "https://plausible.io/js/script.js");
    if (!domain || !src || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return null;
    return { provider, src, attrs: { "data-domain": domain } };
  }
  return null;
}
