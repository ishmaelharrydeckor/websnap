// Carousel / store gallery browser test. Same setup as smoke.mjs.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.OUT_DIR ?? path.join(here, "out");
mkdirSync(OUT, { recursive: true });

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
const slideButtons = () => page.getByRole("button", { name: /^Slide \d+ of \d+$/ });

await page.goto(BASE + "/editor");
await page.waitForTimeout(800);
await page.setInputFiles("[data-testid=file-input]", path.join(here, "fixtures", "shot.png"));
await page.waitForTimeout(800);
check("starts with one slide", (await slideButtons().count()) === 1);

await page.getByRole("button", { name: "Duplicate", exact: true }).click();
await page.getByRole("button", { name: "Add blank", exact: true }).click();
await page.waitForTimeout(300);
check("duplicate and blank add slides", (await slideButtons().count()) === 3);
check("the new slide is active", (await slideButtons().nth(2).getAttribute("aria-current")) === "true");

await page.getByRole("button", { name: "Move slide left" }).click();
check("moving keeps the slide active", (await slideButtons().nth(1).getAttribute("aria-current")) === "true");

// Canvas size is shared by every slide
await page.getByRole("button", { name: "Canvas", exact: true }).click();
await page.getByRole("button", { name: /Story/ }).click();
await page.waitForTimeout(200);
await slideButtons().nth(0).click();
await page.waitForTimeout(200);
check("canvas size follows on other slides", /1080\s*×\s*1920/.test(await page.locator("main").innerText()));

// New set
await page.getByRole("button", { name: "New set…" }).click();
const dialog = page.getByRole("dialog", { name: "New set" });
check("new set dialog opens focused inside", await dialog.evaluate((d) => d.contains(document.activeElement)));
await dialog.getByLabel(/Number of slides/).fill("4");
await dialog.getByLabel(/Headlines/).fill("One\nTwo\nThree\nFour");
await dialog.getByRole("button", { name: "Create set" }).click();
await page.waitForTimeout(500);
check("a set of 4 is created", (await slideButtons().count()) === 4);

// Seamless background
await page.getByLabel("Seamless background").check();
await page.waitForTimeout(300);

// Reload: the project comes back
await page.waitForTimeout(1500);
await page.reload();
await page.waitForTimeout(1200);
check("project survives a reload", (await slideButtons().count()) === 4);

// Export PDF and ZIP
await page.getByRole("button", { name: "Export slides…" }).click();
await page.getByRole("button", { name: "PDF", exact: false }).filter({ hasText: "One page per slide" }).click();
const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download", exact: true }).last().click()]);
const pdfPath = path.join(OUT, "slides.pdf");
await pdf.saveAs(pdfPath);
const pdfBytes = readFileSync(pdfPath);
check("PDF downloads", pdf.suggestedFilename() === "websnap-slides.pdf" && pdfBytes.subarray(0, 5).toString() === "%PDF-");
await page.waitForTimeout(500);
await page.getByRole("button", { name: "Export slides…" }).click();
const [zip] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download", exact: true }).last().click()]);
await zip.saveAs(path.join(OUT, "slides.zip"));
check("ZIP downloads", zip.suggestedFilename() === "websnap-slides.zip");

// Delete asks first
await page.getByRole("button", { name: "Delete", exact: true }).click();
check("delete asks for confirmation", (await page.getByRole("alertdialog").count()) === 1);
await page.getByRole("button", { name: "Delete slide" }).click();
await page.waitForTimeout(200);
check("slide deleted", (await slideButtons().count()) === 3);

// Accessibility
await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
const violations = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map((v) => `${v.id} (${v.nodes.length})`));
check("axe finds no violations", violations.length === 0, violations.join(", "));

await page.screenshot({ path: path.join(OUT, "slides.png") });
check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
process.exit(failed ? 1 : 0);
