import { getShare } from "@/server/share/instance";
import { isValidId } from "@/server/share/validate";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** The shared design and the list of files it uses, so the editor can open it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const share = getShare();
  const { cfg } = share;
  if (!cfg.enabled || !isValidId(id)) return json({ error: "Not found" }, 404);
  const [record, doc] = [share.service.get(id), await share.service.readDoc(id)];
  if (!record || !doc) return json({ error: "Not found" }, 404);
  // A project is stored as {slides, active, continuous}; `doc` stays its first slide so older clients still open something.
  const project = "slides" in doc ? doc : undefined;
  return json({ id, createdAt: record.createdAt, expiresAt: record.expiresAt, doc: project ? project.slides[0] : doc, project, assets: record.assets });
}

/** Removes a share. The delete token comes from when it was created. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const share = getShare();
  const { cfg } = share;
  if (!cfg.enabled || !isValidId(id)) return json({ error: "Not found" }, 404);
  const token = request.headers.get("x-delete-token") ?? "";
  if (!token || !(await share.service.remove(id, token))) return json({ error: "Not found" }, 404);
  return json({ deleted: true });
}
