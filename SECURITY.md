# Security policy

## Reporting a vulnerability

Please **don't open a public issue** for a security problem. Use GitHub's private reporting instead: on the
repository page choose **Security → Report a vulnerability**. If that isn't available, message the maintainer
privately and ask for a secure way to send details.

Please include what you found, how to reproduce it, and what you think the impact is. We'll acknowledge your report,
keep you updated, and credit you when it's fixed if you'd like.

## What matters most

WebSnap's editor runs in the browser and stores designs only on the user's device. The parts that run on a server
are optional and off by default, and these are where security matters most:

- **Screenshot a URL** (`SCREENSHOT_ENABLED=1`) makes the server fetch web pages for visitors. Anything that lets a
  request reach a private network, local service or cloud metadata address (SSRF), bypass the checked fetcher, or
  escape the size, time or rate limits is a vulnerability.
- **Share links** (`SHARE_ENABLED=1`) store uploaded files. Anything that lets uploaded content run as a page,
  read or delete someone else's share, guess ids, or exhaust storage past the limits is a vulnerability.

See `docs/SELF_HOSTING.md` for how these are protected and what hosts should do (tokens, reverse proxy, limits).

## Supported versions

The project is young: only the latest commit on the main branch is supported.

## For people hosting WebSnap

Keep dependencies and Chromium up to date, set `SHARE_UPLOAD_TOKEN` and `SCREENSHOT_TOKEN` on public servers,
never set `SCREENSHOT_ALLOW_PRIVATE=1` in production, and run the container as an unprivileged user with no access
to your private network.
