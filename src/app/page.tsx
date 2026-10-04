import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-5xl font-semibold tracking-tight">Make your screenshots worth posting.</h1>
      <p className="max-w-xl text-lg text-neutral-600">
        WebSnap turns screenshots and screen recordings into polished posts and device mockups.
        Free, open source, and it runs in your browser.
      </p>
      <Link
        href="/editor"
        className="rounded-full bg-black px-6 py-3 text-sm font-medium text-white hover:bg-neutral-800"
      >
        Open the editor
      </Link>
    </main>
  );
}
