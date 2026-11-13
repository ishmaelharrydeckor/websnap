/** When the Launch Kit pop-up may appear. All state lives in this browser's localStorage. */
const KEY = "websnap-kit-popup";
const SNOOZE_DAYS = 14;
const EVENT = "websnap:kit-popup";

interface Saved {
  /** Don't show again before this time (ms since 1970). Infinity-like for people who signed up. */
  until?: number;
  /** An export has already triggered the pop-up once. */
  exported?: boolean;
}

function read(): Saved {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Saved;
  } catch {
    return {};
  }
}

function write(next: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), ...next }));
  } catch {
    // Storage may be blocked. The pop-up then only shows once per page view.
  }
}

export const popupAllowed = () => (read().until ?? 0) < Date.now();
/** Never shortens an existing pause, so closing the box after signing up keeps it silenced for good. */
export const snoozePopup = () => write({ until: Math.max(read().until ?? 0, Date.now() + SNOOZE_DAYS * 864e5) });
export const silencePopup = () => write({ until: Number.MAX_SAFE_INTEGER });

/** Asks for the pop-up after a person's first successful export, the moment they've just got something from WebSnap. */
export function requestKitPopupAfterExport() {
  if (typeof window === "undefined" || read().exported) return;
  write({ exported: true });
  window.dispatchEvent(new Event(EVENT));
}

export const KIT_POPUP_EVENT = EVENT;
