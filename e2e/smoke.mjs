// Browser smoke test. Needs a running server and a Chromium:
//   npm run build && npm start &            (port 3000)
//   BASE_URL=http://localhost:3000 CHROMIUM_PATH=/path/to/chromium node e2e/smoke.mjs
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const fixture = (n) => path.join(here, "fixtures", n);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
page.on("console", (m) => m.type() === "error" && errors.push("CONSOLE " + m.text()));
let failed = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failed++;
  console.log((ok ? "PASS " : "FAIL ") + name + (extra ? " — " + extra : ""));
};
const hash = () =>
  page.evaluate(() => {
    const c = document.querySelector("[data-testid=editor-canvas]");
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let h = 0;
    for (let i = 0; i < d.length; i += 61) h = (h * 31 + d[i]) | 0;
    return h;
  });
const tab = (n) => page.getByRole("button", { name: n, exact: true }).click();
const layout = (n) => page.getByRole("group", { name: "Layout" }).getByRole("button", { name: n, exact: true }).click();

await page.goto(BASE + "/editor");
await page.waitForTimeout(800);
await page.setInputFiles("[data-testid=file-input]", fixture("shot.png"));
await page.waitForTimeout(900);

// ---- layouts
await tab("Style");
const base = await hash();
const seen = new Set([base]);
for (const l of ["2 screens", "3 screens", "4 screens", "Rising", "Bleeding", "Phone in front", "Phone front, left", "1 screen"]) {
  await layout(l);
  await page.waitForTimeout(300);
  const h = await hash();
  if (l === "1 screen") check("back to 1 screen restores the first picture", h === base);
  else {
    check(`layout ${l} changes the picture`, !seen.has(h));
    seen.add(h);
  }
}
const screens = async () => await page.locator("aside li").count();
await layout("4 screens");
check("4 screens lists four screen rows", (await screens()) === 4);
await layout("1 screen");

// ---- devices
for (const d of ["iPhone", "Android", "iPad", "Tablet", "Watch", "MacBook", "iMac", "Monitor"]) {
  await page.getByRole("button", { name: d, exact: true }).click();
  await page.waitForTimeout(250);
  check(`device ${d} draws`, (await hash()) !== base);
}
await page.getByRole("button", { name: "iPhone", exact: true }).click();
const portrait = await hash();
await page.getByLabel("Rotate device").check();
await page.waitForTimeout(250);
check("Rotate device changes a phone", (await hash()) !== portrait);
await page.getByRole("button", { name: "MacBook", exact: true }).click();
check("no Rotate toggle on a laptop", (await page.getByLabel("Rotate device").count()) === 0);

// ---- headline position and templates
await tab("Text");
await page.getByRole("button", { name: "Show headline" }).click().catch(() => {});
await tab("Templates");
const labels = await page.locator('aside button[aria-label^="Apply "]').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
const names = labels.map((l) => l.replace(/^Apply /, "").replace(/ template$/, ""));
check("there are at least 30 templates", names.length >= 30, String(names.length));
let blank = 0;
for (const n of names) {
  await page.getByRole("button", { name: `Apply ${n} template`, exact: true }).click();
  await page.waitForTimeout(200);
  if ((await hash()) === 0) blank++;
}
check("every template draws something", blank === 0, `${blank} blank`);

// ---- template search, filters, saving, export and import
await page.getByLabel("Search templates").fill("launch");
await page.waitForTimeout(200);
check("search narrows the list", (await page.locator('aside button[aria-label^="Apply "]').count()) === 1);
await page.getByLabel("Search templates").fill("");
await page.getByRole("group", { name: "Filter templates" }).getByRole("button", { name: "combo", exact: true }).click();
const combos = await page.locator('aside button[aria-label^="Apply "]').count();
check("the combo filter shows only phone-in-front templates", combos >= 3 && combos < names.length, String(combos));
await page.getByRole("group", { name: "Filter templates" }).getByRole("button", { name: "combo", exact: true }).click();
await page.getByRole("button", { name: "Save current look" }).click();
await page.getByLabel("Template name").fill("Smoke look");
await page.getByRole("button", { name: "Save", exact: true }).click();
await page.waitForTimeout(300);
check("a saved template appears under Your templates", (await page.getByRole("button", { name: "Apply Smoke look template" }).count()) === 1);
const [exp] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export yours" }).click()]);
check("Export yours downloads a JSON file", exp.suggestedFilename() === "websnap-templates.json");
await page.getByRole("button", { name: "Delete template Smoke look" }).click();
check("a template can be deleted", (await page.getByRole("button", { name: "Apply Smoke look template" }).count()) === 0);
await page.setInputFiles("[data-testid=template-import-input]", {
  name: "t.json",
  mimeType: "application/json",
  buffer: Buffer.from(JSON.stringify({ templates: [{ name: "Imported one", frame: { style: "imac", dark: true }, layout: "frontPhone" }, 42] })),
});
await page.waitForTimeout(300);
check("an imported template appears (and the broken entry is reported)", (await page.getByRole("button", { name: "Apply Imported one template" }).count()) === 1 && /1 skipped/.test(await page.getByRole("status").last().innerText()));
await page.getByRole("button", { name: "Apply Imported one template" }).click();
await page.waitForTimeout(250);
check("applying the imported template draws", (await hash()) !== 0);

// ---- export
const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download" }).click()]);
check("downloads a PNG", dl.suggestedFilename().endsWith(".png"), dl.suggestedFilename());

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
process.exit(failed ? 1 : 0);
