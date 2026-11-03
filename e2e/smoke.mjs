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
for (const l of ["2 screens", "3 screens", "4 screens", "Rising", "Bleeding", "1 screen"]) {
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
const names = await page.locator("aside details button").evaluateAll((els) => els.map((e) => e.textContent.trim()).filter(Boolean));
check("there are at least 25 templates", names.length >= 25, String(names.length));
console.log("templates:", names.join(", "));
let blank = 0;
for (const n of names) {
  await page.locator("aside").getByRole("button", { name: n }).first().click();
  await page.waitForTimeout(250);
  if ((await hash()) === 0) blank++;
}
check("every template draws something", blank === 0, `${blank} blank`);

// ---- export
const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download" }).click()]);
check("downloads a PNG", dl.suggestedFilename().endsWith(".png"), dl.suggestedFilename());

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
process.exit(failed ? 1 : 0);
