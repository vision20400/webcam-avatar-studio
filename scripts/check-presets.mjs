/**
 * Validates the bundled avatars without launching a browser: every preset in
 * the catalog must exist, be a VRM 1.0 file, carry the humanoid bones the
 * solver drives, and have a thumbnail on disk.
 *
 *   npm run check:avatars
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Mirrors REQUIRED_BONES in src/lib/avatar/boneMapping.ts.
const REQUIRED = ["hips", "head", "leftUpperArm", "rightUpperArm", "leftLowerArm", "rightLowerArm"];
const EXPECTED = [
  "leftHand", "rightHand", "leftUpperLeg", "rightUpperLeg",
  "leftLowerLeg", "rightLowerLeg", "leftFoot", "rightFoot", "neck", "spine",
];
const FINGERS = ["leftThumbProximal", "leftIndexProximal", "rightIndexProximal"];

function parseGlbJson(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("glb 헤더가 아닙니다");
  let offset = 12;
  while (offset < buf.byteLength) {
    const len = dv.getUint32(offset, true);
    const type = dv.getUint32(offset + 4, true);
    const start = offset + 8;
    if (type === 0x4e4f534a) return JSON.parse(buf.subarray(start, start + len).toString("utf8"));
    offset = start + len;
  }
  throw new Error("JSON 청크를 찾지 못했습니다");
}

// The catalog is TypeScript; read the ids straight out of it so the two files
// cannot drift apart.
const catalog = readFileSync(join(root, "src/lib/avatar/presets.ts"), "utf8");
const ids = [...catalog.matchAll(/id:\s*"([^"]+)"/g)].map((m) => m[1]);

let failures = 0;
const check = (label, ok, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : " FAIL "} ${label} — ${detail}`);
};

check("카탈로그에 프리셋 8개", ids.length === 8, `${ids.length}개`);

let total = 0;
for (const id of ids) {
  const vrm = join(root, "public/avatars", `${id}.vrm`);
  const thumb = join(root, "public/avatars/thumbs", `${id}.jpg`);

  if (!existsSync(vrm)) {
    check(id, false, "vrm 파일이 없습니다");
    continue;
  }
  total += statSync(vrm).size;

  const json = parseGlbJson(readFileSync(vrm));
  const vrmExt = json.extensions?.VRMC_vrm;
  const bones = vrmExt?.humanoid?.humanBones ?? {};
  const missing = REQUIRED.filter((b) => !bones[b]);
  const missingExpected = EXPECTED.filter((b) => !bones[b]);
  const fingers = FINGERS.filter((b) => bones[b]).length;
  const expressions = Object.keys(vrmExt?.expressions?.preset ?? {});

  check(
    `${id}`,
    vrmExt !== undefined && missing.length === 0 && existsSync(thumb),
    [
      vrmExt ? "VRM 1.0" : "VRM 확장 없음",
      missing.length ? `필수 본 누락 ${missing.join(",")}` : `본 ${Object.keys(bones).length}개`,
      missingExpected.length ? `선택 본 누락 ${missingExpected.length}` : "전신",
      `손가락 ${fingers}/${FINGERS.length}`,
      `표정 ${expressions.length}개`,
      existsSync(thumb) ? `썸네일 ${(statSync(thumb).size / 1024).toFixed(0)}KB` : "썸네일 없음",
    ].join(" · "),
  );
}

console.log(
  failures === 0
    ? `\n전부 통과했습니다. 내장 아바타 합계 ${(total / 1048576).toFixed(0)}MB\n`
    : `\n${failures}개 실패했습니다.\n`,
);
process.exit(failures === 0 ? 0 : 1);
