/**
 * Sends a named event to whichever analytics provider is loaded. Does nothing when none is.
 * Events carry counts and choices only (for example an export format). Never pass images, text, file names or emails.
 */
export type EventProps = Record<string, string | number | boolean>;

declare global {
  interface Window {
    umami?: { track: (name: string, data?: EventProps) => void };
    plausible?: (name: string, options?: { props?: EventProps }) => void;
  }
}

/** Keeps simple values only and caps their length, so nothing large or structured can slip into an event. */
export function cleanProps(props?: Record<string, unknown>): EventProps | undefined {
  if (!props) return undefined;
  const out: EventProps = {};
  for (const [key, value] of Object.entries(props).slice(0, 10)) {
    if (typeof value === "string") out[key.slice(0, 40)] = value.slice(0, 60);
    else if (typeof value === "number" && Number.isFinite(value)) out[key.slice(0, 40)] = value;
    else if (typeof value === "boolean") out[key.slice(0, 40)] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

export function track(event: string, props?: Record<string, unknown>): void {
  try {
    if (typeof window === "undefined") return;
    const data = cleanProps(props);
    if (window.umami?.track) window.umami.track(event, data);
    else if (typeof window.plausible === "function") window.plausible(event, data ? { props: data } : undefined);
  } catch {
    // Analytics must never break the editor.
  }
}

/** A template event. Only the names of built-in and Launch Kit looks are sent; a person's own template names stay private. */
export function trackTemplate(template: { id: string; name: string }, builtIn: boolean): void {
  if (builtIn) track("template_applied", { template: template.name, source: "builtin" });
  else if (template.id.startsWith("kit-")) track("template_applied", { template: template.name, source: "kit" });
  else track("template_applied", { source: "custom" });
}
