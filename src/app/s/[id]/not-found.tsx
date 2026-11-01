import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">This link isn&apos;t available</h1>
      <p className="text-neutral-600">It may have been deleted or expired, or sharing is turned off on this server.</p>
      <Link href="/editor" className="rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800">
        Open the editor
      </Link>
    </main>
  );
}
