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
| Share | Optional upload + public link (Phase 4) |

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

### Phase 0: Foundation (current)
Scaffold Next.js/TS/Tailwind, MIT license, README, CI (lint, typecheck, test, build),
document schema + empty editor shell.

### Phase 1: Core editor (image)
Renderer + document model first, then UI.
- Import: upload/paste/drop
- Canvas size presets; background (solid, gradient, a first set of wallpapers)
- Frames: none, macOS, browser, Safari; padding/radius/shadow
- Headline + watermark text
- Export PNG/JPG/WebP, copy to clipboard
- Undo/redo, local save of designs

### Phase 2: Annotations, layers, brand
Arrow/shape/steps/draw; blur/pixelate/redact/highlight/spotlight/magnify; layers panel,
snapping; brand kit; templates; Cmd+K.

### Phase 3: Mockups
Device registry (iPhone, iPad, MacBook, browser), multi-device layouts, perspective/tilt,
adaptive shadow, palette-based magic background, more wallpaper packs, multi-size ZIP.

### Phase 4: Video and animation
Screen recording; timeline editor (playhead, play/loop, media filmstrip track,
animations track, timeline zoom); trim/split/speed; zoom regions; captions; audio;
Static/Parallax modes and zoom/tilt animation clips; MP4/WebM/GIF export.

### Phase 5: Sharing and extras
Upload + public links (self-hostable), screenshot-a-URL (headless browser service),
effects (noise/VHS/glitch), 3D scenes, desktop/extension wrappers.

## Templates
Templates are JSON documents in our own model that keep the user's content when swapped.
Starter set (Phase 2): Hero, Split, Card, Compare, Browser, iPhone, MacBook, Minimal.
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
