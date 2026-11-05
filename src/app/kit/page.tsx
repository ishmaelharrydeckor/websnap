import type { Metadata } from "next";
import Link from "next/link";
import { KitGallery } from "@/features/kit/KitGallery";
import { LeadForm } from "@/features/kit/LeadForm";
import { KIT_LOOKS } from "@/lib/kit/looks";
import { REPO_URL, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "The Launch Kit",
  description: `${KIT_LOOKS.length} polished looks for your screenshots, free for WebSnap. Backgrounds, device mockups, headlines and layouts, ready to import.`,
};

const pick = (id: string) => KIT_LOOKS.find((l) => l.id === id)!;
const STEPS = [
  { n: "1", title: "Get the kit", text: "Enter your email and we send one file, no account needed." },
  { n: "2", title: "Import it", text: "In the editor, open Templates and choose Import file." },
  { n: "3", title: "Drop in a screenshot", text: "Click any look. Your screenshot, text and notes stay put as you switch." },
];

function Shot({ id, className }: { id: string; className: string }) {
  const l = pick(id);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={l.image} alt="" width={1600} height={900} decoding="async" className={`absolute rounded-[22px] border border-white/15 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.9)] ${className}`} />
  );
}

export default function KitPage() {
  return (
    <div className="bg-neutral-950 text-neutral-100">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {SITE_NAME}
        </Link>
        <nav aria-label="Main" className="flex items-center gap-5 text-sm text-neutral-300">
          <a href="#looks" className="hidden hover:text-white sm:inline">
            Looks
          </a>
          <a href="#how" className="hidden hover:text-white sm:inline">
            How it works
          </a>
          <a href={REPO_URL} className="hidden hover:text-white sm:inline">
            Source
          </a>
          <Link href="/editor" className="whitespace-nowrap rounded-full border border-white/20 px-4 py-2 font-medium hover:bg-white/10">
            Open the editor
          </Link>
        </nav>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[640px] bg-[radial-gradient(ellipse_at_50%_0%,rgba(138,77,255,0.35),transparent_60%),radial-gradient(ellipse_at_80%_20%,rgba(255,95,162,0.22),transparent_50%)]" />
          <div className="relative mx-auto max-w-4xl px-6 pb-10 pt-16 text-center sm:pt-24">
            <p className="inline-block rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm text-neutral-300">{KIT_LOOKS.length} looks · Free for WebSnap</p>
            <h1 className="mt-6 text-balance text-5xl font-semibold leading-[1.02] tracking-tight sm:text-7xl">
              Make every screenshot <span className="bg-gradient-to-r from-[#b79cff] to-[#ff7ac8] bg-clip-text text-transparent">look expensive.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-neutral-400 sm:text-xl">
              The Launch Kit is a free collection of polished backgrounds, device mockups and layouts for WebSnap. Import once, then pick a look and post.
            </p>
            <div className="mt-9 flex justify-center">
              <LeadForm id="get-kit" />
            </div>
          </div>

          <div className="relative mx-auto mt-6 hidden h-[430px] max-w-5xl sm:block" aria-hidden="true">
            <Shot id="app-store-night" className="left-[2%] top-16 w-[40%] -rotate-[5deg]" />
            <Shot id="cobalt-studio" className="right-[2%] top-16 w-[40%] rotate-[5deg]" />
            <Shot id="launch-day" className="left-1/2 top-0 z-10 w-[52%] -translate-x-1/2" />
          </div>
        </section>

        <section id="looks" className="mx-auto max-w-6xl scroll-mt-8 px-6 pb-8 pt-20">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Every look, ready to use</h2>
          <p className="mt-3 max-w-2xl text-neutral-400">Browse by what you&apos;re making. Each preview uses sample content, and your own screenshot drops into any of them.</p>
          <div className="mt-10">
            <KitGallery />
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-8 px-6 py-20">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Three steps</h2>
          <ol className="mt-10 grid gap-5 sm:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-3xl border border-white/10 bg-white/[0.04] p-7">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-sm font-bold text-neutral-950">{s.n}</span>
                <h3 className="mt-5 text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-neutral-400">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="relative overflow-hidden rounded-[36px] border border-white/10 bg-gradient-to-br from-[#2a1566] via-[#1a0f3d] to-[#0d0926] px-6 py-16 text-center sm:px-16">
            <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[#ff5fa2]/25 blur-3xl" />
            <h2 className="relative text-balance text-3xl font-semibold tracking-tight sm:text-5xl">Get all {KIT_LOOKS.length} looks, free.</h2>
            <p className="relative mx-auto mt-4 max-w-xl text-neutral-300">Open source and private. WebSnap runs in your browser and nothing is uploaded.</p>
            <div className="relative mt-8 flex justify-center">
              <LeadForm id="get-kit-2" compact />
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl border-t border-white/10 px-6 py-8 text-sm text-neutral-500">
        <p>
          {SITE_NAME} is free and open source.{" "}
          <a href={REPO_URL} className="underline hover:text-neutral-300">
            View the code
          </a>
          .
        </p>
      </footer>
    </div>
  );
}
