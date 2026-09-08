/**
 * Pulls the thumbnail out of each bundled VRM's metadata and writes it next to
 * the models, so the avatar picker has artwork without shipping a second set of
 * renders. Run once after adding or replacing a preset:
 *
 *   node scripts/extract-vrm-thumbnails.mjs
 *
 * Resizing uses macOS `sips`; on other platforms the full-size PNG is kept.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { basename, join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "public/avatars");
const thumbs = join(dir, "thumbs");

function parseGlb(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("not a glb");
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < buf.byteLength) {
    const len = dv.getUint32(offset, true);
    const type = dv.getUint32(offset + 4, true);
    const start = offset + 8;
    if (type === 0x4e4f534a) json = JSON.parse(buf.subarray(start, start + len).toString("utf8"));
    if (type === 0x004e4942) bin = buf.subarray(start, start + len);
    offset = start + len;
  }
  return { json, bin };
}

let sips = true;
try {
  execFileSync("which", ["sips"], { stdio: "ignore" });
} catch {
  sips = false;
}

for (const file of readdirSync(dir).filter((f) => f.endsWith(".vrm")).sort()) {
  const { json, bin } = parseGlb(readFileSync(join(dir, file)));
  const meta = json.extensions?.VRMC_vrm?.meta ?? json.extensions?.VRM?.meta ?? {};
  const index = meta.thumbnailImage ?? meta.texture;
  if (index === undefined) {
    console.warn(`${file}: 썸네일이 없습니다 — 건너뜁니다.`);
    continue;
  }
  const image = json.images[index];
  const view = json.bufferViews[image.bufferView];
  const start = view.byteOffset ?? 0;
  const raw = bin.subarray(start, start + view.byteLength);

  const name = basename(file, ".vrm");
  const png = join(thumbs, `${name}.png`);
  writeFileSync(png, raw);
  if (sips) {
    const jpg = join(thumbs, `${name}.jpg`);
    execFileSync("sips", ["-Z", "384", "-s", "format", "jpeg", "-s", "formatOptions", "82", png, "--out", jpg], { stdio: "ignore" });
    rmSync(png);
    console.log(`${name}: ${(raw.byteLength / 1024).toFixed(0)}KB PNG -> ${(readFileSync(jpg).byteLength / 1024).toFixed(0)}KB JPEG`);
  } else {
    console.log(`${name}: ${(raw.byteLength / 1024).toFixed(0)}KB PNG (sips 없음, 원본 유지)`);
  }
}
