# WebSnap: Product & Build Plan

An open-source, browser-based tool for turning screenshots and screen recordings into
polished social posts and device mockups. Everything runs locally in the browser;
sharing is opt-in.

Inspiration (ideas only; no code, assets or branding are copied):
- **WerbSnap** (werbsnap.com): social-post workflow, annotations, brand kit, recording editor.
- **Shots** (shots.so): device mockup library, multi-device layouts, animated mockups.

## Principles
1. **Local-first.** No account, no upload unless the user clicks Share.
2. **One renderer.** Editor state is a JSON document; one renderer draws both the
   on-screen preview and the export.
3. **Open core.** The local editor stays open source and free. Paid features are layered on later (see Business model).
4. **Our own assets.** Device frames, wallpapers and fonts are drawn in code/SVG or
   openly licensed.

## Feature map (target)

| Area | Features |
|---|---|
| Import | Upload, paste (Ctrl/Cmd+V), drag-drop, screen capture, video upload, screen record; later: screenshot a URL |
| Canvas | Social size presets (X, LinkedIn, Instagram, Story, OG, YouTube, ...), custom size |
| Background | Solid, gradient, mesh, image, auto-blur, code-drawn wallpapers (hue/softness/brightness/vignette/grain), palette-derived "magic" background |
| Frames | None, glass, bezel, macOS, browser, Safari (light/dark); devices: iPhone, iPad, MacBook, ...; data-driven device registry |
| Screenshot styling | Padding, size, corner radius (sharp/curved/round), shadow (none/spread/hug/adaptive), 3D perspective + tilt, rotation, position |
| Layouts | Center, split, bleed, columns, compare, showcase; 1-3 devices per canvas |
| Text | Headline, free text boxes, badges, watermark |
| Annotations | Arrow, rect, ellipse, numbered steps, draw, blur, pixelate, redact, highlight, spotlight, magnify |
| Layers | Reorder, multi-select, snapping/guides, undo/redo |
| Brand kit | Saved colors, logo, fonts, handle; one-click apply |
| Templates | Curated layouts that preserve user content |
| Productivity | Command palette (Cmd+K), keyboard shortcuts |
| Export | PNG/JPG/WebP at 1x/2x, copy to clipboard, multi-size ZIP; video: MP4/WebM/GIF |
| Recording | Record tab/window/screen + mic; trim/split/speed; zoom regions; captions; audio |
| Animation | Timeline, parallax/zoom/tilt presets, animated mockup export |
| Effects | Noise, VHS, glitch, 3D shapes/scenes (later) |
| Share | Optional upload + public link (Phase 5, self-hosted) |

## Stack
- Next.js (App Router) + TypeScript + Tailwind
- State: Zustand (+ immer for undo/redo history)
- Rendering: Canvas 2D renderer (WebGL only if perspective/effects demand it)
- Persistence: IndexedDB (designs, image blobs), localStorage (prefs)
- Video: MediaRecorder + WebCodecs; ffmpeg.wasm lazy-loaded for GIF/MP4 fallback
- Tests: Vitest (renderer/model), Playwright (editor flows)
- Phase 4 backend: S3-compatible storage + SQLite/Postgres, self-hostable via Docker

## Architecture
```
src/app/            routes: landing, /editor, /s/[id] (later)
src/features/
  editor/           shell, panels, toolbar, canvas view
  capture/          paste, drop, getDisplayMedia
  recorder/         recording + video timeline (later)
src/lib/
  document/         schema (types), defaults, history, migrations
  render/           renderer: background, frame, shot, text, annotations
  assets/           wallpapers, device registry, size presets
  storage/          IndexedDB wrapper
  export/           png/jpg/webp, zip, video
```
Document sketch:
`{ version, canvas{size,id}, background, frame, shot, media[], timeline{duration,clips[]}, layers[], text, watermark, brand }`

- `media[]`: images and videos in the project (a project can hold several).
- `timeline`: a base layout plus timed animation clips (`{id, type, start, end, params}`),
  e.g. parallax, zoom, tilt. The renderer takes a time `t`; static export is `t = 0`.
- Parallax: background and screenshot move at different rates (plus slight scale), driven by `t`.

## Phases

### Phase 0: Foundation (done)
Scaffold Next.js/TS/Tailwind, MIT license, README, CI (lint, typecheck, test, build),
document schema + empty editor shell.

### Phase 1: Core editor (image) (done)
Renderer + document model first, then UI.
Shipped: upload/paste/drop/screen capture, 8 size presets, gradients/solid/8 code-drawn
wallpapers, frames (none/macOS/browser/Safari, light/dark), padding/radius/shadow,
headline + watermark, PNG/JPG/WebP export at 1x/2x, copy to clipboard, undo/redo,
IndexedDB autosave. Not yet: Safari-specific details beyond the address pill, custom canvas sizes.
- Import: upload/paste/drop
- Canvas size presets; background (solid, gradient, a first set of wallpapers)
- Frames: none, macOS, browser, Safari; padding/radius/shadow
- Headline + watermark text
- Export PNG/JPG/WebP, copy to clipboard
- Undo/redo, local save of designs

### Phase 2: Annotations, layers, brand (done)
Shipped: arrow, rectangle, ellipse, numbered steps, freehand draw, text, stickers, image layers;
blur, pixelate, redact, highlight, spotlight, magnify (stuck to the screenshot); on-canvas
select/move/resize; layers panel (visibility, reorder, delete) and inspector; tool and
nudge/delete shortcuts; brand kit (colors, logo, font, handle; saved locally); document-wide
font; 8 starter templates; Cmd/Ctrl+K command palette.
Deferred: snapping/alignment guides, multi-select, drag-to-reorder layers, duplicate layer,
text editing directly on the canvas (text is edited in the inspector), Split/Compare/iPhone/
MacBook templates (they need multi-image layouts and device frames from Phase 3).

### Phase 3: Mockups (done)
Done: code-drawn device registry (iPhone, Android, iPad, MacBook, monitor); 1/2/3-screen layouts
with per-screen images; 3D perspective/tilt (Flat, Left, Right, Lean, Iso + sliders) via mesh
projection; shadow modes (none/spread/hug/adaptive); palette-based magic background with shuffle;
8 more wallpapers; 5 new templates (iPhone, MacBook, Compare, Showcase, Isometric).
Multi-size ZIP export: pick sizes, each is re-laid out (not stretched) with pixel sizes scaled
proportionally; stored (uncompressed) ZIP written in-browser.
Polish (after the first Phase 3 pass): screens are mapped through an exact homography, so screenshot
effects and shapes can be drawn, picked, moved and resized on a tilted screen (the selection outline
tilts too). Shapes that start on a screen are attached to it (coordinates relative to its frame), so
they keep their place on the screenshot across export sizes, layouts and tilts; the inspector has an
"Attach to screen" toggle. Verified numerically across three export sizes.
Remaining limits: text and numbered steps under tilt follow the screen's local rotation and scale but
are not foreshortened; rounded rectangle corners become straight when tilted.

### Phase 4: Video and animation (done, except the MP4 check in a real browser)
- Video as media: upload (mp4/webm/mov) or record the screen (with sound); playback synced to a clock, scrub,
  looping; recordings made seekable; videos persist locally.
- Timeline editing: split at the playhead, delete segments, speed 0.5x-16x, drag-to-trim; each edit is one
  undo step and the timeline length follows.
- Animations: zoom (with gliding between close zooms), parallax drift, tilt clips, and layers that appear on cue;
  clips are dragged and resized on a track. Mouse editing pauses while a zoom/drift is in view.
- Every screen's video follows the timeline's cuts and speed (shorter videos wrap around). The timeline shows a
  filmstrip and an audio waveform for the cut video.
- Sound: the first screen's video sound follows its cuts and speed (parts faster than 2x are left silent),
  with a volume control; an optional music track with volume and a fade-out, trimmed to the timeline.
  The preview plays both.
- Export (frame-accurate: every frame is rendered at its exact time, with each video seeked to its exact
  frame): WebM (VP9 + Opus), MP4 (H.264 + AAC), GIF (shared palette, dithering, frame differencing).
  Own WebM/MP4 muxers and GIF encoder; progress and cancel; sound is reported honestly if a browser can't
  encode it.

Verification: muxers and the browser's WebM/GIF exports were checked against ffmpeg/ffprobe (frame counts,
durations, seeking, pixel colours at known times, tone frequency and level of the audio). The sandbox's
Chromium has no H.264 or AAC encoder, so the live MP4 path (WebCodecs H.264 + AAC) has NOT run end to end:
the MP4 muxer was verified with real ffmpeg H.264 and AAC streams, and MP4 is disabled in the dialog when the
browser can't encode H.264. Needs a try in real Chrome/Edge/Safari.

Known limits: only the first screen's video is heard (others follow the cuts but are silent); sped-up audio
changes pitch (no time-stretching); the preview of music is approximate when scrubbing; Chromium is the only
browser exercised. Still open: MP4 (H.264/AAC) needs a try in real Chrome/Edge/Safari.

### Phase 5: Sharing and extras (done)
Done so far: **effects** (film grain, VHS, glitch): sliders in the Background tab, applied by the shared renderer to
preview, images and every video frame, animated over time and repeatable frame by frame. Cost at 1600x900 is
about 15-40 ms per frame, so the preview may drop below 30 fps with all three at maximum; export is unaffected.

**Share links** (self-hostable): Share button uploads the design, its files and a PNG preview; public page
`/s/<id>` with "Open in the editor" (loads the design and files); delete from the browser that made it. Server:
Next route handlers, SQLite (`node:sqlite`) for records, files in a folder or any S3-compatible bucket, size
and type limits, per-IP rate limit, optional upload token and expiry. Off unless `SHARE_ENABLED=1`. Docker
files and docs in `docs/SELF_HOSTING.md`. Verified end to end in Chromium (24 checks) and with the standalone
server build. NOT verified: the Docker image (no Docker daemon here), the S3 driver against a real S3/MinIO
server (unit-tested with a mocked SDK), video playback on the link page (it shows the preview picture; the
video is only played after "Open in the editor").

**Screenshot a URL**: "From URL" in the header; the server opens the page in headless Chromium
(`playwright-core`) and returns a PNG (window size, whole page, dark mode, 2x). SSRF defences: URL rules, every
request (page, subresources, each redirect hop) goes through our own fetcher that connects only to addresses
that passed the check, Chromium has no direct network, plus size/time/request/pixel limits, rate limit,
concurrency limit, optional token. Off unless `SCREENSHOT_ENABLED=1`. Verified with 34 server checks and 14 UI
checks against a local test site (including blocked ports/addresses, redirects, timeouts, oversize responses),
plus unit tests. NOT verified: DNS-rebinding against a real resolver (covered by unit tests with a fake one), the
Docker Chromium install, and pages that need WebSockets (closed on purpose) or logins (not supported).

**3D shapes**: Background tab > "3D shapes" (orbs, cubes, rings, mix; colours that match the background or a
preset; size; motion; shuffle). A small software 3D renderer in the shared canvas renderer: lit meshes
(rings, cubes), gradient-shaded balls, seeded arrangement that keeps the middle clear for the screens, most
shapes behind the screens and a few in front, drifting with the camera's parallax and spinning over the
timeline (so video exports animate). Limits: not real WebGL (no reflections, shadows or textures), shapes
don't intersect or cast shadows, fixed light direction, no custom 3D models.

**Decision: no desktop or browser-extension wrappers.** WebSnap stays a web app (the project owner's call):
everything it needs (upload, paste, drop, screen capture, recording, export) already works in the browser.

### Polish after Phase 5
- **Accessibility**: axe-core finds no violations on the home page, the editor's tabs, dialogs, command palette,
  timeline, layers and the share pages (contrast, names, headings fixed). Dialogs trap and restore focus
  (`useModalFocus`); the preview canvas has a text label. Not done: a screen-reader walkthrough, and canvas
  editing (drawing and moving layers) still needs a mouse or touch.
- **Small screens**: below 768 px the panels sit under the preview and the toolbar scrolls sideways; at tablet
  width the toolbar wraps. Checked at 390x844 (phone, with touch: tapping templates, drawing an arrow with a
  finger) and 820x1180, with no page overflow and no axe violations at phone width. Still desktop-first: dense
  panels and the timeline are cramped on a phone, and only Chromium emulation was used (no real device).
- **Landing page** at `/` with real screenshots made by the editor itself; the product name lives in
  `src/lib/site.ts`, so renaming is a one-file change plus docs.
- **Repo basics**: CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue and PR templates. Contribution terms
  (CLA or DCO) are deliberately left undecided in CONTRIBUTING.

### Second look at Shots (ideas only), and a UI refresh
Added after re-reading what Shots offers (nothing copied):
- **Edge styles** for the screenshot's window or device: glass light, glass dark, inset, outline, border, with a
  strength slider. Works flat and tilted; templates keep the user's chosen style.
- **Transparent** and **own-picture** backgrounds (PNG/WebP keep the see-through areas, JPG gets a white backing;
  the preview shows a checkerboard), and **custom canvas size** (16-8192 px).
- **Window light** effect (soft diagonal bands of shade, drifting over time).
- **Fast preview** (half-size preview for heavy designs; exports unaffected), **keyboard shortcuts** list (`?`),
  **Start over** (with confirmation).
- Fixed along the way: effects were only applied to the top-left part of a 2x export and to the wrong area of
  scaled video frames; they now follow the canvas's real pixel size.
- **UI refresh**: Geist type (the old rule forced Arial), three-step surface tokens, icons, grouped toolbars,
  export options moved to a bar above the canvas, icon tabs, collapsible panel sections, dot-grid stage.
Not done from that list: portrait/landscape toggle for devices, layouts for more than three screens, stock photo
search (needs an API key and a service), a "liquid glass" refraction look, and live background variants for video.

### More templates and mockups
- **Layouts**: 4 screens (2 x 2), a device **rising** from the bottom edge, a large device **bleeding** off the canvas
  edge, and a headline **column** on the left or right (text wraps beside the screens). On tall canvases a side
  headline moves above or below the screens so they aren't squeezed. A layout picker shows a small diagram of each.
- **Devices**: Watch, Tablet and iMac (drawn in code, like the rest), plus **Rotate device** for phones and
  tablets (on their side, with the camera and buttons turned too).
- **Templates**: 28 (15 new: Split, Card, Rise, Bleed, Grid, Watch, iMac, Tablet, Sideways, Pair, Glass, Orbit,
  Neon, Inset, Outline). A template is a whole look: it also sets the edge style, 3D shapes and device rotation;
  grain/VHS/glitch effects stay. Every template is checked on four canvas sizes.
- Limits: no per-screen device mix (one frame style for all screens), no fanned/overlapping screen layouts, no
  custom drag-to-position of a device on the canvas, and the headline column is plain wrapped text.
- `npm run e2e` runs a browser smoke test (`e2e/smoke.mjs`) against a running server.

### Mixed devices and a template system
- **Phone in front** layouts (`frontPhone`, `frontPhoneLeft`): a laptop, iMac or window with an iPhone overlapping its
  lower corner. Each screen can now have its own frame style, so layouts can mix devices. The phone shows screen 1's
  picture until it has its own. Four templates use it (Launch, Desk, Web + app, Studio pair).
- **Template search and filters** (chips such as desktop, phone, combo, dark, 3d, glass, worked out from each
  template's settings), **Save current look** as a template, **Export** and **Import** template files (JSON, repaired
  on import so a bad file can't break the editor). Format and quality bar in `docs/TEMPLATES.md`.
- **Strategy** in `docs/STRATEGY.md`; how to carry on locally in `docs/CONTINUE_LOCALLY.md`.
- Limits: only the phone in the combo is fixed to an iPhone; no more than two screens in a combo; no contrast or
  visual-snapshot checks for templates yet.

## Templates
Templates are JSON documents in our own model that keep the user's content when swapped.
Shipped: Hero, Spotlight, Clean, Bold, Minimal, Soft, Ocean, Studio (Phase 2); iPhone, MacBook,
Compare, Showcase, Isometric (Phase 3); Split, Card, Rise, Bleed, Grid, Watch, iMac, Tablet, Sideways, Pair, Glass,
Orbit, Neon, Inset, Outline (later).
Each social size gets its own layout rather than a stretched one.

Inspiration sources (ideas only, never copied assets):
1. WerbSnap's template names/layouts (Hero, Split, Bleed card, Rise, Card, Long page, Compare, devices).
2. Shots' template gallery (not yet reviewed; needs manual screenshots).
3. High-performing real posts (Product Hunt, X, LinkedIn, app store screenshots).
4. Public design references (Dribbble, Behance, Mobbin, Apple product pages) for layout study.
5. Our own per-platform constraints (X, LinkedIn, Instagram, Story, OG).

## Business model (open source now, paid later)
Approach: **open core.** The local-first editor is open source; paid tiers sit on top.

Stays free and open source: the editor, import, frames, backgrounds, annotations, local
export (PNG/JPG/WebP), local video recording/export basics, local save.

Candidate paid features (hosted services and extras, not locked-down core features):
- Hosted share links and storage, cloud sync of designs and brand kit
- Team workspaces, shared brand kits and templates
- Premium asset packs (wallpapers, device frames, templates)
- AI features (e.g. generated backgrounds)
- Higher-resolution/longer video export, batch/multi-size export

Principles:
- No watermark gating in the open-source build; anyone can remove it from source.
  Monetise services and assets that cost money to run or produce.
- Keep the paid layer in clearly separated modules (or a private repo) from day one.
- Decide the license and contribution terms before the repo goes public or accepts outside PRs.

**Decision: MIT** (decided by the project owner). The options below are kept for reference.

License options considered:
| Option | Effect |
|---|---|
| MIT (current) | Max adoption; anyone can host a competing paid copy; cannot be revoked once released |
| AGPL-3.0 | Hosted forks must publish their changes; deters resellers; dual-license possible |
| BSL / source-available | Blocks competing hosted use for a period; not OSI "open source" |
| Open-core split | Core permissive/copyleft; premium code in a separate proprietary repo |
With MIT, paid value must come from hosted services, assets and extras (see above), since
the code itself can be reused by anyone. A CLA or DCO is still worth adding early.

## Risks / notes
- Browser capture APIs vary by browser; feature-detect with fallbacks.
- `ffmpeg.wasm` is large; load on demand.
- Device bezels and wallpapers are the largest asset effort; keep them data-driven.
- URL screenshots need a server; keep out of the local-only core.
- Respect third-party IP: take inspiration from features, not code, art or branding.

## Open questions
- Final product name/branding (working name: WebSnap; to be decided later).
- CLA/DCO choice before accepting outside contributions (license is decided: MIT).
- Phase 5 hosting targets (storage/DB); default assumption: S3-compatible storage + SQLite/Postgres.
- Template content: design our own (Hero, Split, Card, Compare, device layouts).
