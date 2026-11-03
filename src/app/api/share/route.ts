import { timingSafeEqual } from "node:crypto";
import { getShare } from "@/server/share/instance";
import { validateUpload } from "@/server/share/validate";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function tokenOk(header: string | null, expected: string): boolean {
  const given = Buffer.from(header?.replace(/^Bearer\s+/i, "") ?? "");
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

/** Tells the editor whether sharing is available on this server and what the limits are. */
export async function GET() {
  const { cfg } = getShare();
  return json({
    enabled: cfg.enabled,
    requiresToken: Boolean(cfg.uploadToken),
    maxFileMB: Math.round(cfg.maxFileBytes / 1048576),
    maxTotalMB: Math.round(cfg.maxTotalBytes / 1048576),
    expireDays: cfg.expireDays,
  });
}

/** Uploads a design (multipart: `doc`, `preview`, and one `asset:<id>` per file it uses). */
export async function POST(request: Request) {
  const share = getShare();
  const { cfg, limiter } = share;
  if (!cfg.enabled) return json({ error: "Sharing is not enabled on this server." }, 404);
  if (cfg.uploadToken && !tokenOk(request.headers.get("authorization"), cfg.uploadToken)) return json({ error: "A valid upload token is required." }, 401);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (!limiter.allow(ip)) return json({ error: "Too many uploads. Try again later." }, 429);

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > cfg.maxTotalBytes + 2 * 1048576) return json({ error: "The upload is too large." }, 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "The upload couldn't be read." }, 400);
  }
  const docText = form.get("doc");
  const preview = form.get("preview");
  if (typeof docText !== "string") return json({ error: "The design is missing." }, 400);
  const assetFiles: { id: string; file: File }[] = [];
  for (const [key, value] of form.entries()) {
    if (key.startsWith("asset:") && value instanceof File) assetFiles.push({ id: key.slice(6), file: value });
  }

  const checked = validateUpload(
    docText,
    preview instanceof File ? { name: "preview", type: preview.type, size: preview.size } : undefined,
    assetFiles.map((a) => ({ name: a.id, type: a.file.type, size: a.file.size })),
    cfg,
  );
  if (!checked.ok) return json({ error: checked.error }, checked.status);

  try {
    const { id, deleteToken } = await share.service.create({
      doc: checked.doc,
      project: checked.project,
      preview: { bytes: new Uint8Array(await (preview as File).arrayBuffer()), type: (preview as File).type },
      assets: await Promise.all(assetFiles.map(async (a) => ({ id: a.id, bytes: new Uint8Array(await a.file.arrayBuffer()), type: a.file.type }))),
    });
    return json({ id, url: `/s/${id}`, deleteToken }, 201);
  } catch {
    return json({ error: "Couldn't save the share. Try again." }, 500);
  }
}
