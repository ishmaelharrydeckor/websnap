# WebSnap

Open-source screenshot and screen recording beautifier that runs in your browser.
Turn a plain screenshot into a polished post or device mockup. No account, no upload.

> Status: working, pre-1.0. The editor covers screenshots and video: annotations, brand kit, templates, device mockups with 3D tilt, edge styles, 3D shapes, effects, recording, a timeline with cuts, speed and animation, sound, and PNG/JPG/WebP/WebM/MP4/GIF export. Optional self-hosted share links and screenshots of web addresses. MP4 export has not yet been tried in a real browser. See [PLAN.md](./PLAN.md) for details and known limits.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm run lint
npm test
npm run build
```

## Share links (optional, self-hosted)

The editor works fully offline in the browser. If you host it yourself you can turn on a Share button that
uploads a design to your server and returns a public link. It is off by default.
See [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) (Docker, folder or S3-compatible storage, limits, safety notes).
The same guide covers the optional "From URL" button, which screenshots a public web page on the server.

## Layout

- `src/lib/document`: editor document schema and defaults
- `src/lib/render`: canvas renderer shared by preview and export
- `src/lib/assets`: size presets, backgrounds, wallpapers, fonts, templates
- `src/lib/brand`: brand kit logic
- `src/lib/state`: editor store (undo/redo, layers, selection)
- `src/lib/storage`, `src/lib/export`: local persistence, image export and the ZIP writer
- `src/lib/render/perspective.ts`: 3D tilt (mesh projection)
- `src/lib/timeline`: cuts, speed, animation clips
- `src/lib/video`: video loading, playback sync, WebM/MP4 muxers, GIF encoder
- `src/lib/export/video.ts`, `audio.ts`: the frame-by-frame video and soundtrack export
- `src/features/editor`: editor UI

## Analytics and the Launch Kit page (optional)

Both are off by default. See [docs/ANALYTICS.md](docs/ANALYTICS.md) for privacy-friendly analytics (Umami or Plausible) and [docs/KIT.md](docs/KIT.md) for the `/kit` page and its email sign-up.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

MIT
