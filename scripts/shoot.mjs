/**
 * Screenshots the embed view in headless Chrome, so visual changes (scenic
 * backdrops, avatars, camera framing) can be checked without a person sitting
 * in front of the webcam.
 *
 *   node scripts/shoot.mjs busan cyber gradient
 *
 * Uses the Chrome already installed on the machine rather than downloading a
 * second browser. A fake camera device stands in for the webcam.
 */
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = process.env.SHOT_DIR ?? join(root, ".shots");
const base = process.env.SHOT_BASE ?? "http://localhost:3000";
const preset = process.env.SHOT_PRESET ?? "01-female-cute";
const backgrounds = process.argv.slice(2);
if (backgrounds.length === 0) backgrounds.push("busan", "cyber");

const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--enable-unsafe-swiftshader",
    "--hide-scrollbars",
  ],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1000, deviceScaleFactor: 1 });
  page.on("pageerror", (err) => console.error("  page error:", err.message));

  for (const bg of backgrounds) {
    // "studio" shoots the full app instead of the chrome-free embed view.
    const url =
      bg === "studio-ui"
        ? base
        : `${base}/embed?bg=${bg}&avatar=${preset}&camera=full`;
    await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 });
    // Give the VRM (14-16MB) and the first frames time to settle.
    await new Promise((r) => setTimeout(r, 9000));
    const file = join(outDir, `${bg}.png`);
    await page.screenshot({ path: file });
    console.log(`${bg} -> ${file}`);
  }
} finally {
  await browser.close();
}
