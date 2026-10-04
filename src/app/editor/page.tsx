import { EditorCanvas } from "@/features/editor/EditorCanvas";
import { createDefaultDocument } from "@/lib/document/defaults";

export const metadata = { title: "Editor · WebSnap" };

export default function EditorPage() {
  const doc = createDefaultDocument();
  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex h-14 items-center border-b border-white/10 px-4 text-sm font-medium">
        WebSnap · {doc.canvas.width}×{doc.canvas.height}
      </header>
      <main className="flex min-h-0 flex-1 items-center justify-center p-8">
        <EditorCanvas doc={doc} />
      </main>
    </div>
  );
}
