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
