# Making templates

A template is a **look**: background, window or device, layout, headline style, edge style, 3D shapes. It never
contains a person's screenshots, text or layers, so it can be shared safely.

You can make one in three ways:

1. **In the editor**: set up a design you like, open **Templates**, press **Save current look**. It appears under
   *Your templates*. **Export yours** downloads them as one JSON file; **Import file** loads such a file.
2. **As a JSON file** (below), for designers who want to hand-craft a pack.
3. **In code**: add an entry to `src/lib/assets/templates.ts` (this is how the built-in ones are made).

## File format

```json
{
  "format": "websnap-templates",
  "version": 1,
  "templates": [
    {
      "name": "Launch",
      "tags": ["saas", "product hunt"],
      "background": { "kind": "gradient", "angle": 135, "stops": [{ "offset": 0, "color": "#a18cd1" }, { "offset": 1, "color": "#fbc2eb" }] },
      "frame": { "style": "macbook", "dark": false },
      "layout": "frontPhone",
      "shot": { "padding": 0.07, "radius": 14, "shadow": 60, "shadowMode": "spread" },
      "edge": { "style": "glassLight", "opacity": 0.5 },
      "scene": { "kind": "orbs", "palette": "auto", "size": 1, "motion": 0.5 },
      "tilt": { "x": 0, "y": 0, "z": 0 },
      "headline": { "show": true, "position": "top", "align": "center", "size": 58, "color": "#2b1d4a" }
    }
  ]
}
```

Only `name` is required; anything missing or invalid is replaced by a safe default, so a mistake never breaks the
editor. Values you can use:

| Field | Choices |
|---|---|
| `background.kind` | `solid` (`color`), `gradient` (`angle`, 2 to 8 `stops`), `wallpaper` (`id` of a built-in one), `transparent` |
| `frame.style` | `none`, `macos`, `browser`, `safari`, `iphone`, `android`, `ipad`, `tablet`, `watch`, `macbook`, `imac`, `monitor` |
| `frame.landscape` | `true` turns a phone or tablet on its side |
| `layout` | `single`, `duo`, `trio`, `quad`, `rise`, `bleed`, `frontPhone`, `frontPhoneLeft` |
| `shot.shadowMode` | `none`, `spread`, `hug`, `adaptive` |
| `edge.style` | `glassLight`, `glassDark`, `inset`, `outline`, `border` |
| `scene.kind` / `palette` | `orbs`, `cubes`, `rings`, `mix` / `auto`, `sunset`, `ocean`, `candy`, `mono` |
| `headline.position` | `top`, `bottom`, `left`, `right` (left and right make a text column; on tall canvases it moves above or below) |

Tags are optional. Filter chips such as *desktop*, *phone*, *dark*, *3d* and *glass* are worked out automatically
from the settings.

## A good template (the quality bar)

- **Works at every size.** The same template is used on a wide X post and a tall Story. Check at least
  1600x900, 1080x1080, 1080x1920 and 1200x630 (the automated test does this for built-in templates).
- **Text is readable.** Headline colour against the background should reach a contrast ratio of 4.5:1.
- **Content comes first.** The screenshot is the hero: nothing should hide it, and 3D shapes should stay at the edges.
- **Has a point of view.** One clear idea (a dark glass look, a laptop with a phone, a bold colour block), not a
  mix of everything.
- **Names say what it is.** "Launch" or "Split", not "Template 7".
