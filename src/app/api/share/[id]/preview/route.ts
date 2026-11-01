import { FILE_HEADERS, getShare } from "@/server/share/instance";
import { isValidId } from "@/server/share/validate";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const share = getShare();
  const { cfg } = share;
  if (!cfg.enabled || !isValidId(id)) return new Response("Not found", { status: 404 });
  const file = await share.service.readPreview(id);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.bytes as BodyInit, { headers: { ...FILE_HEADERS, "Content-Type": file.type } });
}
