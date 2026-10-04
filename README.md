# WebSnap

Open-source screenshot and screen recording beautifier that runs in your browser.
Turn a plain screenshot into a polished post or device mockup. No account, no upload.

> Status: early development (Phase 0). See [PLAN.md](./PLAN.md) for the roadmap.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm run lint
npm test
npm run build
```

## Layout

- `src/lib/document`: editor document schema and defaults
- `src/lib/render`: canvas renderer shared by preview and export
- `src/lib/assets`: size presets (wallpapers and device registry to come)
- `src/features/editor`: editor UI

## License

MIT
