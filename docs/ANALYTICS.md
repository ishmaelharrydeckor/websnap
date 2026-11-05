# Analytics (optional)

WebSnap can count visits and a few key actions with a privacy-friendly analytics service. It is **off by default**: a self-hosted copy collects nothing unless you turn it on.

## Turn it on

Set these on the server **before** `next build` / `next start` (they are read when the page is built or served).

**Umami** (open source, can be self-hosted, has a free cloud plan):

| Variable | Needed | Value |
| --- | --- | --- |
| `ANALYTICS_PROVIDER` | yes | `umami` |
| `UMAMI_WEBSITE_ID` | yes | The website id from your Umami dashboard |
| `UMAMI_SCRIPT_URL` | no | Your own Umami script (https). Defaults to Umami Cloud. |

**Plausible**:

| Variable | Needed | Value |
| --- | --- | --- |
| `ANALYTICS_PROVIDER` | yes | `plausible` |
| `PLAUSIBLE_DOMAIN` | yes | The site you added in Plausible, for example `websnap.example.com` |
| `PLAUSIBLE_SCRIPT_URL` | no | Your own Plausible script (https). Defaults to plausible.io. |

Check each service's current plan and limits before you choose.

## What it records

Page views come from the service itself, including where a visitor came from (the referring site and any `utm_` tags in the link).
WebSnap adds these named events:

| Event | When | Details sent |
| --- | --- | --- |
| `export` | Download succeeds | format, scale |
| `copy` | Copy to clipboard succeeds | none |
| `export_all_sizes` | All sizes ZIP downloaded | number of sizes, format |
| `export_video` | Video or GIF export succeeds | format |
| `template_applied` | A template is applied | the template name for built-in and Launch Kit looks; only `custom` for a person's own templates |
| `share_created` | A share link is created | none |
| `kit_filter` | A filter is clicked on `/kit` | the filter |
| `kit_signup` / `kit_signup_error` | The kit form succeeds or fails | the error reason, for failures |
| `kit_download` | The kit download link is clicked | none |

## What it never records

Screenshots, videos, text, file names, email addresses or template names that a person made. Event details are limited to short plain values, so nothing structured or large can be attached.

## Privacy

- The script is not loaded for visitors who send **Do Not Track** or **Global Privacy Control**.
- Neither service needs a cookie banner for this use by default, but the rules differ by country, so check the requirements for where your visitors are.
- Because WebSnap runs in the browser and uploads nothing, the analytics are the only thing that leaves the page, and only when you turn them on.

## Tracking where visitors come from

Give every post or group its own link, for example:

`https://your-site/kit?utm_source=facebook&utm_medium=group&utm_campaign=launch&utm_content=designers-group`

The analytics service shows visits by source and campaign. The `/kit` sign-up form also passes the same tags to Brevo, so each lead is tied to the post that brought them in (see `docs/KIT.md`).

A useful path to watch: visit `/kit` → `kit_signup` (leads), and visit `/editor` → `export` (people who got a result).
