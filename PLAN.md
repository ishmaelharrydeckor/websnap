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
3. **Free and unwatermarked.** It's open source; no paywalled features.
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

## Risks / notes
- Browser capture APIs vary by browser; feature-detect with fallbacks.
- `ffmpeg.wasm` is large; load on demand.
- Device bezels and wallpapers are the largest asset effort; keep them data-driven.
- URL screenshots need a server; keep out of the local-only core.
- Respect third-party IP: take inspiration from features, not code, art or branding.

## Open questions
- Final product name/branding (working name: WebSnap; to be decided later).
- Phase 5 hosting targets (storage/DB); default assumption: S3-compatible storage + SQLite/Postgres.
- Template content: design our own (Hero, Split, Card, Compare, device layouts).
