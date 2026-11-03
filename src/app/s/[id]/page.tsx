import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getShare } from "@/server/share/instance";
import { isValidId } from "@/server/share/validate";
import { SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";

function lookup(id: string) {
  const share = getShare();
  const { cfg } = share;
  if (!cfg.enabled || !isValidId(id)) return undefined;
  return share.service.get(id);
}

export async function generateMetadata({ params }: PageProps<"/s/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!lookup(id)) return { title: "Not found" };
  const image = `/api/share/${id}/preview`;
  return {
    title: "Shared design",
    metadataBase: process.env.SHARE_PUBLIC_URL ? new URL(process.env.SHARE_PUBLIC_URL) : undefined,
    openGraph: { title: `Shared design · ${SITE_NAME}`, images: [image] },
    twitter: { card: "summary_large_image", images: [image] },
    robots: { index: false },
  };
}

export default async function SharedDesign({ params }: PageProps<"/s/[id]">) {
  const { id } = await params;
  const record = lookup(id);
  if (!record) notFound();
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-6 px-6 py-10">
      {/* eslint-disable-next-line @next/next/no-img-element -- user content served by our own API, size unknown */}
      <img src={`/api/share/${id}/preview`} alt={`A shared ${SITE_NAME} design`} className="max-h-[75vh] w-auto max-w-full rounded-xl shadow-2xl" />
      <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
        <Link href={`/editor?open=${id}`} className="rounded-full bg-black px-5 py-2.5 font-medium text-white hover:bg-neutral-800">
          Open in the editor
        </Link>
        <a href={`/api/share/${id}/preview`} download={`websnap-${id}.png`} className="rounded-full border border-neutral-300 px-5 py-2.5 font-medium hover:bg-neutral-100">
          Download image
        </a>
        <span className="text-neutral-500">Shared {new Date(record.createdAt).toLocaleDateString()}</span>
      </div>
    </main>
  );
}
