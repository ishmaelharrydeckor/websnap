# Continuing on your own computer

Cloud sessions are temporary: when the credit runs out, the container is thrown away. **Everything that matters is in
the Git repository**, so you lose nothing as long as the work is pushed. This guide gets you running locally.

## 1. Get the code

```bash
git clone https://github.com/ishmaelharrydeckor/websnap.git
cd websnap
git checkout claude/dreamy-dijkstra-ewhkpn      # all the work so far lives on this branch
```

The branch has not been merged into `main`. When you are happy with it, open a pull request from it (or merge it
yourself) so `main` has everything.

## 2. Run it

You need **Node 22.13 or newer** (the share server uses the built-in `node:sqlite`) and Git.

```bash
npm ci
npm run dev          # http://localhost:3000/editor, reloads as you edit
```

Checks to run before you commit (the same ones CI runs):

```bash
npm run lint
npx tsc --noEmit
npm test             # unit tests
npm run build
```

Browser smoke test (needs a built, running server and a Chromium or Chrome):

```bash
npm run build && npm start &                      # port 3000
BASE_URL=http://localhost:3000 CHROMIUM_PATH="/path/to/chrome" npm run e2e
```

Optional server features (both off by default, see `docs/SELF_HOSTING.md`):

```bash
SHARE_ENABLED=1 npm run dev
SCREENSHOT_ENABLED=1 SCREENSHOT_CHROMIUM_PATH="/path/to/chrome" npm run dev
```

## 3. Keep working with an AI assistant

The project is set up so a fresh assistant can pick up the thread:

- `AGENTS.md` / `CLAUDE.md`: this uses a recent Next.js whose APIs differ from older ones; read the guide in
  `node_modules/next/dist/docs/` before changing routing or config.
- `PLAN.md`: what each phase delivered, what is verified, and the known limits (it is honest about what was not tested).
- `docs/STRATEGY.md`: where the product should go next and why.
- `CONTRIBUTING.md`: how the code is organised and what a good change looks like.

With Claude Code on your machine (see the Claude Code documentation for installing it), open a terminal in the
`websnap` folder, run `claude`, and start with something like: *"Read PLAN.md and docs/STRATEGY.md, then continue
with the next item."*

## 4. Things to know

- **MP4 export** has never been run in a real browser. Try an export in Chrome, Edge or Safari first; it is the
  largest unknown.
- Only Chromium was tested. Check Firefox and Safari.
- The Docker image and S3 storage for share links were never tested against real services.
- The old browser test scripts from the cloud sessions were lost; `e2e/smoke.mjs` is the replacement and covers
  less. Growing it is a good first task.
- Saved designs and templates live in your browser (IndexedDB and localStorage), not in the repo.
