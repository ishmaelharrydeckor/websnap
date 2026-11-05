import Image from "next/image";
import Link from "next/link";
import { KIT_LOOKS } from "@/lib/kit/looks";
import { REPO_URL, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/site";

const FEATURES = [
  { title: "Beautiful in seconds", text: "Drop in a screenshot and pick a template. Backgrounds, shadows, frames and headlines are one click each, and a magic background is built from your screenshot's own colors." },
  { title: "Device mockups", text: "Put your screens in an iPhone, Android phone, iPad, MacBook or monitor, or a browser window. Show one, two or three screens, and tilt them in 3D." },
  { title: "Screen recordings, too", text: "Record your screen or upload a video. Cut it, speed it up, add zooms and parallax, add music, and export a WebM, MP4 or GIF." },
  { title: "Annotate and add text", text: "Arrows, boxes, numbered steps, blur, pixelate, redact, highlight, spotlight and magnify. Add text, stickers and your logo." },
  { title: "Looks and 3D shapes", text: "Film grain, VHS and glitch effects, plus floating 3D orbs, cubes and rings that move with your video." },
  { title: "Every size at once", text: "Export for X, LinkedIn, Instagram, Stories and link previews in one ZIP. Each size is laid out again, not just stretched." },
];

const STEPS = [
  { n: "1", title: "Add your media", text: "Upload, paste, drag in, capture your screen, or record." },
  { n: "2", title: "Make it yours", text: "Choose a template, then tweak the background, frame, text and shapes." },
  { n: "3", title: "Export or share", text: "Download an image or video, copy it, or share a link if your host turns that on." },
];

export default function Home() {
  return (
    <div className="bg-neutral-950 text-neutral-100">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="text-lg font-semibold tracking-tight">{SITE_NAME}</span>
        <nav aria-label="Main" className="flex items-center gap-5 text-sm text-neutral-300">
          <a href="#features" className="hidden hover:text-white sm:inline">Features</a>
          <a href="#how" className="hidden hover:text-white sm:inline">How it works</a>
          <Link href="/kit?utm_source=website&utm_medium=nav" className="hidden hover:text-white sm:inline">Launch Kit</Link>
          <a href={REPO_URL} className="hidden hover:text-white sm:inline">Source</a>
          <Link href="/editor" className="whitespace-nowrap rounded-full bg-white px-4 py-2 font-medium text-neutral-900 hover:bg-neutral-200">
            Open the editor
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pt-12 pb-16 text-center">
          <p className="mx-auto mb-5 w-fit rounded-full border border-white/15 px-3 py-1 text-xs text-neutral-300">Free and open source · No sign-up · Runs in your browser</p>
          <h1 className="mx-auto max-w-3xl text-5xl font-semibold tracking-tight text-balance sm:text-6xl">{SITE_TAGLINE}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-neutral-300 text-balance">{SITE_DESCRIPTION}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/editor" className="rounded-full bg-orange-700 px-6 py-3 text-sm font-semibold text-white hover:bg-orange-600">
              Open the editor
            </Link>
            <a href={REPO_URL} className="rounded-full border border-white/20 px-6 py-3 text-sm font-medium hover:bg-white/10">
              View the source
            </a>
          </div>
          <Image
            src="/landing/hero.png"
            alt="A browser window showing a product page, on a pink and purple gradient with floating 3D shapes"
            width={1600}
            height={900}
            priority
            className="mx-auto mt-14 w-full max-w-5xl rounded-2xl shadow-2xl ring-1 ring-white/10"
          />
        </section>

        <section id="features" className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-3xl font-semibold tracking-tight">Everything you need to make a post worth sharing</h2>
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-300">{f.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Private by default</h2>
            <p className="mt-4 leading-relaxed text-neutral-300">
              Your screenshots and recordings are processed in your browser and saved on your own device. Nothing is uploaded unless you
              press a button that says so, and there is no account to make.
            </p>
            <p className="mt-4 leading-relaxed text-neutral-300">
              If you host {SITE_NAME} yourself you can switch on share links and screenshots of web addresses, using your own storage.
            </p>
          </div>
          <Image
            src="/landing/phones.png"
            alt="Two phone mockups side by side on a dark teal and blue background"
            width={1600}
            height={900}
            className="w-full rounded-2xl shadow-2xl ring-1 ring-white/10"
          />
        </section>

        <section id="how" className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-3xl font-semibold tracking-tight">How it works</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-2xl border border-white/10 p-6">
                <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-orange-700 text-sm font-semibold text-white">
                  {s.n}
                </span>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-neutral-300">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-[#2a1566] via-[#1a0f3d] to-[#0d0926] p-8 sm:p-12">
            <div className="grid items-center gap-10 md:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-[#b79cff]">Free · {KIT_LOOKS.length} looks</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Get the Launch Kit</h2>
                <p className="mt-4 leading-relaxed text-neutral-300">
                  Polished backgrounds, device mockups and layouts for every kind of post: apps, SaaS, portfolios, agencies and shops. Import it once, then pick a look.
                </p>
                <Link href="/kit?utm_source=website&utm_medium=landing" className="mt-7 inline-block rounded-full bg-white px-6 py-3 text-sm font-semibold text-neutral-900 hover:bg-neutral-200">
                  Browse the {KIT_LOOKS.length} looks
                </Link>
              </div>
              <div aria-hidden="true" className="relative h-52 sm:h-64">
                <Image src="/kit/looks/app-store-night.webp" alt="" width={1600} height={900} className="absolute left-0 top-8 w-[58%] -rotate-[5deg] rounded-2xl border border-white/15 shadow-2xl" />
                <Image src="/kit/looks/editorial-red.webp" alt="" width={1600} height={900} className="absolute right-0 top-8 w-[58%] rotate-[5deg] rounded-2xl border border-white/15 shadow-2xl" />
                <Image src="/kit/looks/launch-day.webp" alt="" width={1600} height={900} className="absolute left-1/2 top-0 z-10 w-[66%] -translate-x-1/2 rounded-2xl border border-white/15 shadow-2xl" />
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pt-8 pb-24 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Make your first one now</h2>
          <p className="mx-auto mt-3 max-w-xl text-neutral-300">It takes less than a minute, and it&apos;s free.</p>
          <Link href="/editor" className="mt-7 inline-block rounded-full bg-orange-700 px-7 py-3 text-sm font-semibold text-white hover:bg-orange-600">
            Open the editor
          </Link>
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-sm text-neutral-400">
          <span>
            {SITE_NAME} is free software under the{" "}
            <a href={`${REPO_URL}/blob/main/LICENSE`} className="underline hover:text-white">MIT license</a>.
          </span>
          <span className="flex gap-5">
            <Link href="/kit?utm_source=website&utm_medium=footer" className="hover:text-white">Launch Kit</Link>
            <a href={REPO_URL} className="hover:text-white">Source code</a>
            <a href={`${REPO_URL}/blob/main/CONTRIBUTING.md`} className="hover:text-white">Contribute</a>
            <a href={`${REPO_URL}/blob/main/docs/SELF_HOSTING.md`} className="hover:text-white">Self-hosting</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
