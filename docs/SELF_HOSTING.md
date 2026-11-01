# Self-hosting WebSnap with share links

The editor runs entirely in the browser and needs no server features. **Share links** are optional: when
enabled, a "Share" button uploads a design to *your* server and gives back a public link.

## What gets uploaded

Only when someone clicks **Create link** and confirms: the design (JSON), the image/video/audio files it uses,
and a PNG preview of the current frame. Nothing is uploaded otherwise.

Each link is `/s/<id>`, where the id is 72 random bits (not guessable, not listed anywhere). The link page shows
the preview and offers "Open in the editor", which loads the design and its files into the visitor's editor.
Link pages ask search engines not to index them.

## Quick start (Docker)

```bash
docker compose up --build
# open http://localhost:3000/editor
```

Data (SQLite database + files) is kept in the `websnap-data` volume.

Without Docker (Node 22.13 or newer, because the server uses the built-in `node:sqlite`):

```bash
npm ci && npm run build
SHARE_ENABLED=1 SHARE_DATA_DIR=./share-data npm start
```

## Settings

All settings are environment variables; see `.env.example` for the full list.

| Variable | Default | Meaning |
|---|---|---|
| `SHARE_ENABLED` | off | Turns sharing on. When off, the Share button explains that and the API answers 404. |
| `SHARE_STORAGE` | `fs` | `fs` stores files under `SHARE_DATA_DIR/files`; `s3` uses an S3-compatible bucket. |
| `SHARE_DATA_DIR` | `./share-data` | SQLite database (`shares.sqlite`) and, for `fs`, the files. |
| `SHARE_MAX_FILE_MB` / `SHARE_MAX_TOTAL_MB` / `SHARE_MAX_FILES` | 50 / 100 / 40 | Per-file, per-share and file-count limits. |
| `SHARE_UPLOADS_PER_HOUR` | 20 | Uploads per IP per hour (0 = unlimited). Kept in memory in one process. |
| `SHARE_UPLOAD_TOKEN` | none | If set, creating links needs this token (people type it into the dialog). |
| `SHARE_EXPIRE_DAYS` | 0 | Links stop working after this many days (0 = never). Expired data is removed on server start. |
| `SHARE_PUBLIC_URL` | none | Public address of the site, used for the preview image in link cards. |

### S3-compatible storage

```
SHARE_STORAGE=s3
S3_BUCKET=websnap
S3_REGION=us-east-1
S3_ENDPOINT=https://<your-endpoint>     # leave out for AWS
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=1                   # needed for MinIO and some others
```

The bucket must already exist and stay **private**: files are only ever served through WebSnap, which checks that
the link still exists. The SQLite database still lives in `SHARE_DATA_DIR`, so keep that on a persistent volume.

## Safety notes

- Uploaded files are user content. They are served with `X-Content-Type-Options: nosniff` and
  `Content-Security-Policy: sandbox`, so they can't run as a page. The server only accepts a fixed list of
  image, video and audio types.
- If the server is public, set `SHARE_UPLOAD_TOKEN` (or put it behind your own login) so strangers can't store
  files on it. The per-IP rate limit reads `X-Forwarded-For`, so it only works properly behind a reverse proxy
  that sets that header and strips any value sent by clients.
- Put the app behind HTTPS (a reverse proxy such as Caddy or nginx). Set the proxy's body size limit above
  `SHARE_MAX_TOTAL_MB`.
- Deleting: the browser that made a link keeps a private delete key and can remove the link from the Share
  dialog. To remove one by hand, delete its folder and row (see `service.ts`).
- Back up the `SHARE_DATA_DIR` volume (and the bucket, if you use S3) like any other data.

## Screenshot a URL (optional)

The editor's **From URL** button asks your server to open a public web page in a headless Chromium and return a
picture. It is off unless `SCREENSHOT_ENABLED=1`, and it needs Chromium on the server (the Docker image installs it;
without Docker run `npx playwright-core install --with-deps chromium`, or point `SCREENSHOT_CHROMIUM_PATH` at one).

| Variable | Default | Meaning |
|---|---|---|
| `SCREENSHOT_ENABLED` | off | Turns the feature on. |
| `SCREENSHOT_TOKEN` | none | If set, requests need this token (people type it into the dialog). |
| `SCREENSHOT_PER_HOUR` | 10 | Captures per IP per hour. |
| `SCREENSHOT_MAX_CONCURRENT` | 2 | Captures running at once; others wait. |
| `SCREENSHOT_TIMEOUT_S` | 25 | Time allowed for one capture. |
| `SCREENSHOT_MAX_RESPONSE_MB` | 25 | Largest single response read from a site. |
| `SCREENSHOT_MAX_REQUESTS` | 200 | Most requests one page may make. |
| `SCREENSHOT_PORTS` | `80,443` | Ports pages may be fetched from. |

### Why this is risky, and what protects it

A server that fetches web addresses for strangers can be tricked into reaching things only the server can reach
(your internal network, cloud metadata at `169.254.169.254`, local services). This is called SSRF. WebSnap defends
in layers:

1. Only `http` and `https`, no usernames or passwords, only the allowed ports, and no `localhost`, `.local` or
   `.internal` names or private IP literals (including odd spellings such as `2130706433` or `::ffff:127.0.0.1`).
2. **Every request the page makes goes through our own fetcher**, not Chromium's network stack: the page, its
   images, scripts, stylesheets, API calls and each redirect hop. The fetcher resolves the name and connects *only
   to an address that passed the check*, so a name can't change its answer between the check and the connection
   (DNS rebinding). Any name with even one private answer is refused.
3. Chromium itself is started with name lookups disabled and a dead proxy, WebSockets are closed, popups and
   downloads are blocked, and each capture uses a fresh browser profile that is thrown away.
4. Size, time, request-count and pixel limits, a per-IP rate limit, and a limit on simultaneous captures.

Things this does **not** do: it doesn't make the *page itself* safe (it runs the page's JavaScript, inside a
disposable browser with no network access except through the fetcher), and Chromium runs with `--no-sandbox`
because containers usually can't use its sandbox. For a public server, also run it as an unprivileged user in a
container with no access to your private network, set `SCREENSHOT_TOKEN`, and keep Chromium updated.
`SCREENSHOT_ALLOW_PRIVATE=1` switches the protection off for local testing: never set it in production.
