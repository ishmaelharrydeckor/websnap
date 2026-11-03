# Where WebSnap should go

This note records the thinking behind the roadmap: what makes the product different from other mockup tools, how to
get better designs into it, and what to build next. It is opinion, written to be argued with.

## What we looked at, and what we could not see

- **Shots** (shots.so): re-read its public page. It is a browser mockup editor with device frames, backgrounds,
  templates, 3D shapes and effects, animated mockups, and links. Animation and video appear to be paid.
- **Framer's template marketplace**: the page text gave names, creators, prices and about sixty categories (portfolio,
  SaaS, agency, e-commerce...). It did **not** reveal how the preview cards look. So the visual ideas below come from
  general knowledge of how designers present sites (a laptop with a phone in front, a floating browser, a bento of tiles,
  dark glass UI), not from inspecting Framer's pictures. Studying real examples on Dribbble, Behance, Mobbin and
  Awwwards is still worth doing by eye, for ideas only, never copying work or assets.

## How we are different

| Idea | Why it matters | Status |
|---|---|---|
| **Open source, self-hostable, no account** | Teams with confidential screenshots can't paste them into a closed web app. Nothing leaves the browser unless you press Share. | Done |
| **Screenshots and video in one tool** | Cut, speed up and zoom a screen recording, then export WebM, MP4 or GIF. | Done (MP4 untested in a real browser) |
| **Everything is a JSON design** | A design can be shared as a link that opens in the editor, and a look can be saved, imported and exported as a template file. This is the base for a template ecosystem. | Done |
| **Screenshot a URL, then mock it up** | Paste an address, get a polished picture in one step. | Done (self-hosted server feature) |
| **Real mixed-device compositions** | Phone in front of a laptop, iMac with a phone, browser with an app. These are how designers actually show a product. | Done (first version) |
| **Responsive showcase from one URL** | Capture a site at desktop and phone width and drop both into a "phone in front" template automatically. Nobody makes this a one-click job. | Next |
| **Carousels and store galleries** | LinkedIn carousels, App Store and Play Store sets, Product Hunt galleries: several canvases in one project, one consistent style, one ZIP or PDF. Single-image tools don't do this. | **Built** (see below) |
| **Brand-aware templates** | Pick a template, press one button, get it in your brand colours, logo and font. The brand kit exists; make templates respond to it. | Partly done |
| **Scroll walkthrough video from a URL** | A headless browser records an automatic scroll of a page, and the result becomes a device mockup video. | Later |

## Getting better designs

Quantity is not the problem; taste is. The honest route:

1. **A quality bar that is checked by machine.** Every template must pass a layout test on four canvas sizes (it
   does), and should also get a contrast check on its headline and a **visual snapshot test**, so a code change
   that quietly ruins a template fails CI. (Contrast and snapshots are not built yet.)
2. **Make it easy for designers to contribute.** Templates are plain JSON (`docs/TEMPLATES.md`). A designer needs no
   code: build a look in the editor, press *Save current look*, export, send the file. Review it against the quality bar.
3. **Curate by studying, not copying.** Make a mood board from public galleries, list the recurring compositions
   (laptop + phone, floating browser, bento, big-type split, dark glass) and build our own version of each, in our own
   colours and shapes.
4. **Let usage tell us.** Count which templates people apply and keep (locally and anonymously only if the host opts
   in), and retire the ones nobody uses.
5. **Later, a marketplace.** Paid template packs from designers, with a revenue share, is the natural paid layer on
   an open-source core. It needs accounts and payments, so it belongs with the hosted product.

## Suggested order

1. **Responsive showcase** (URL → desktop and phone captures → combo template). Small, visibly new, reuses what exists.
2. **Multi-canvas projects** (carousels and store galleries). The biggest feature and the biggest differentiator.
3. **Template quality checks** (contrast, snapshots) and a first pack of 20 more designed templates.
4. **Brand-aware templates** and shape/colour variants of each template.
5. **Hosted layer** (accounts, saved designs in the cloud, paid packs), kept separate from the open core.

## Things to be careful about

- **Don't copy.** Shots, Framer templates and Dribbble shots are other people's work. Take the idea of a composition,
  never the artwork, branding or code.
- **Keep the editor fast.** Software 3D and pixel effects cost time per frame; keep *Fast preview* and measure.
- **Say what is untested.** The README and PLAN list the known gaps; keep that habit.

## Carousels and store galleries: what exists

- A project is a list of slides that share one canvas size. The slide strip under the canvas adds (duplicate or blank), reorders, deletes, and has **Match look** (copies one slide's look to the rest, keeping each slide's pictures and text).
- **New set** builds N slides of a store or social size with a template and one headline per line.
- **Seamless background** makes the background run across all slides, for panoramic carousels.
- **Export slides** gives a ZIP (`slide-01.png`…) or a PDF, at 1x or 2x. The PDF is written by `src/lib/export/pdf.ts` with no dependency.
- Projects are saved in the browser and can be shared as one link (the link preview is slide 1).
- Store sizes in `src/lib/assets/sizes.ts` are from memory. Check each store's current requirements before uploading.

Known limits: adding, removing, moving and replacing slides can't be undone (undo history is per slide and resets on those); the phone in the phone-in-front layouts is always an iPhone; `e2e/slides.mjs` covers the flow in Chromium only.
