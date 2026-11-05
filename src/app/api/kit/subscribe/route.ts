/**
 * Adds an email address to a Brevo list and returns the kit download link.
 * Off unless BREVO_API_KEY and BREVO_LIST_ID are set, so self-hosted copies of WebSnap collect nothing by default.
 *
 *   BREVO_API_KEY            required, kept on the server only
 *   BREVO_LIST_ID            required, numeric id of the list to add people to
 *   KIT_DOWNLOAD_URL         optional, link shown after sign-up (host the file outside this repository)
 *   BREVO_TRACK_ATTRIBUTES   optional, "1" to save where the person came from. Create text attributes
 *                            SOURCE, MEDIUM, CAMPAIGN, CONTENT, REFERRER in Brevo first.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const hits = new Map<string, number[]>();

function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60 * 1000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 5;
}

const clean = (v: unknown, max = 100) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(request: Request) {
  const key = process.env.BREVO_API_KEY;
  const listId = Number(process.env.BREVO_LIST_ID);
  if (!key || !Number.isInteger(listId) || listId <= 0) return Response.json({ ok: false, error: "not_configured" }, { status: 503 });

  let body: { email?: unknown; website?: unknown; source?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  // Honeypot: pretend it worked so bots learn nothing.
  if (clean(body.website)) return Response.json({ ok: true, downloadUrl: null });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited(ip)) return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });

  const email = clean(body.email, 254).toLowerCase();
  if (!EMAIL.test(email)) return Response.json({ ok: false, error: "invalid_email" }, { status: 400 });

  const payload: Record<string, unknown> = { email, listIds: [listId], updateEnabled: true };
  if (process.env.BREVO_TRACK_ATTRIBUTES === "1" && body.source && typeof body.source === "object") {
    const s = body.source;
    payload.attributes = {
      SOURCE: clean(s.utm_source),
      MEDIUM: clean(s.utm_medium),
      CAMPAIGN: clean(s.utm_campaign),
      CONTENT: clean(s.utm_content),
      REFERRER: clean(s.referrer),
    };
  }

  try {
    const res = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload),
    });
    // Brevo answers 201 for a new contact and 204 when an existing one was updated.
    if (res.status === 201 || res.status === 204) return Response.json({ ok: true, downloadUrl: process.env.KIT_DOWNLOAD_URL || null });
    return Response.json({ ok: false, error: "upstream" }, { status: 502 });
  } catch {
    return Response.json({ ok: false, error: "upstream" }, { status: 502 });
  }
}
