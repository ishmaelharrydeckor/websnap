# The Launch Kit page

`/kit` is a page that shows the Launch Kit (a pack of looks you import into the editor) and collects an email address in exchange for the download.
It is off by default: without the settings below, the form tells visitors that sign-up isn't switched on, and nothing is collected.

## Turn on sign-up (Brevo)

Set these on the server that runs WebSnap:

| Variable | Needed | What it does |
| --- | --- | --- |
| `BREVO_API_KEY` | yes | Your Brevo API key. Keep it private; it is only read on the server. |
| `BREVO_LIST_ID` | yes | The numeric id of the Brevo list to add people to. |
| `KIT_DOWNLOAD_URL` | no | A link to the kit file, shown after sign-up. Host the file outside this repository. |
| `BREVO_TRACK_ATTRIBUTES` | no | Set to `1` to save where each person came from. First create these text attributes in Brevo: `SOURCE`, `MEDIUM`, `CAMPAIGN`, `CONTENT`, `REFERRER`. |

Where people came from is read from the link they clicked, for example
`/kit?utm_source=facebook&utm_medium=group&utm_campaign=launch&utm_content=designers`.
Give each post or group its own link so you can see which ones bring in sign-ups.

## What the page stores

Only the email address and, if `BREVO_TRACK_ATTRIBUTES=1`, the link tags above and the referring site's name. No screenshots, file names or editor content are ever sent.

## Updating the looks

The preview images live in `public/kit/looks/` and the list that drives the page is `src/lib/kit/looks.ts`.
