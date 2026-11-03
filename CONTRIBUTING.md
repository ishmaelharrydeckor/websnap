# Contributing to WebSnap

Thanks for wanting to help. WebSnap is a browser-based tool that turns screenshots and recordings into polished
posts and mockups. The editor runs entirely in the browser; the optional server features (share links, screenshot
of a URL) are off unless a host turns them on.

## Getting set up

You need Node 22.13 or newer.

```bash
git clone https://github.com/ishmaelharrydeckor/websnap.git
cd websnap
npm ci
npm run dev        # http://localhost:3000/editor
```

Before you open a pull request, these must pass (CI runs the same):

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

> **Next.js note.** This project uses a recent Next.js whose APIs differ from older versions. Read the matching
> guide in `node_modules/next/dist/docs/` before changing routing, route handlers or config (see `AGENTS.md`).

## How the code is organised

- `src/lib/document` is the design document (one JSON shape) and its migrations. Old saved designs must keep loading,
  so new fields get a default and are repaired in `normalizeDocument`.
- `src/lib/render` is the one renderer. The preview, still exports and every video frame all go through
  `renderDocument`, so a feature added there shows up everywhere. Keep it pure where you can so it can be unit tested.
- `src/lib/video`, `src/lib/export`, `src/lib/timeline` hold the video, audio and animation code.
- `src/features/editor` is the UI. `src/server` and `src/app/api` hold the optional server code.
- Plans and limits live in `PLAN.md`; self-hosting notes in `docs/SELF_HOSTING.md`.

## What a good change looks like

- **Small and focused.** One idea per pull request.
- **Tested.** Add unit tests next to the code (`*.test.ts`). For UI behaviour, say in the pull request how you tried it.
- **Honest.** If something only works in some browsers, or you couldn't test a path, say so in the pull request.
- **Accessible.** Controls need names, text needs enough contrast, dialogs must trap and restore focus
  (use `useModalFocus`), and everything must work from the keyboard.
- **Local-first.** Nothing is uploaded unless the user clicks a button that says so.
- **Our own assets only.** Don't add code, art, fonts or brand names you don't have the right to use. WebSnap is
  inspired by other tools' ideas, never their assets.

## Security

Please don't open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md). Changes to the screenshot-a-URL
code (`src/server/screenshot`) need extra care: every network request must keep going through the checked fetcher.

## Contribution terms

WebSnap is released under the [MIT license](LICENSE). The project owner has not yet decided whether contributors
will be asked to sign a CLA or to sign off commits (DCO). Until that is decided, by sending a pull request you
confirm that you wrote the change (or have the right to submit it) and agree it can be released under the MIT license.

## Conduct

Be kind and assume good faith. See the [Code of Conduct](CODE_OF_CONDUCT.md).
