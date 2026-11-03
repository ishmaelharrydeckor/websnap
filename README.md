# WebSnap

Open-source screenshot and screen recording beautifier that runs in your browser.
Turn a plain screenshot into a polished post or device mockup. No account, no upload.

> Status: early development (Phases 0-4 done: image editor with annotations, brand kit, templates, command palette, device mockups, 3D perspective, and video: recording, timeline editing, animations, sound, and MP4/WebM/GIF export). See [PLAN.md](./PLAN.md) for the roadmap.

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

MIT
