# Put WebSnap online for testers (Vercel)

This gives you a public link with no server to run. The editor works entirely in the visitor's browser, so
nothing they make is uploaded. Share links and screenshot-a-URL stay off, because both need a server that
stores files or runs a browser.

## Steps

1. Sign in at vercel.com with your GitHub account.
2. **Add New → Project**, pick the `websnap` repository.
3. Leave the defaults (Framework: Next.js, build `npm run build`). Do not set any environment variables.
4. Deploy. You get a link like `websnap-xxxx.vercel.app`. Open `/editor`.
5. Optional: **Settings → Domains** to add your own domain.

Every push to the branch you pick as the production branch redeploys. Other branches get their own preview link,
which is handy for trying a change before testers see it.

## Before you send the link

- Open the link yourself in Chrome and Safari. Upload a screenshot, make a set, export.
- Make sure the repository is **public**, or testers can't open the Feedback button's GitHub page.
- Check the landing page text says what you want testers to expect.

## What testers will and won't have

| Works | Off on this setup |
| --- | --- |
| Editor, templates, sets and carousels, ZIP/PDF/PNG export | Share links (need `SHARE_ENABLED` and storage) |
| Designs saved in their own browser | Screenshot-a-URL (needs `SCREENSHOT_ENABLED` and a browser on the server) |

Because designs are saved in each person's browser, clearing site data deletes them. Tell testers to export what matters.

## Unverified

This setup hasn't been deployed from here yet. The first deploy may need a small fix; send me the build log if so.
