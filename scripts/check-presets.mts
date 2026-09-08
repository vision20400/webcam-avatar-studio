/**
 * Validates the avatar catalog without launching a browser: every bundled
 * preset must exist, be a VRM 1.0 file, carry the humanoid bones the solver
 * drives, and have a thumbnail on disk.
 *
 * Models marked `bundled: false` are licensed against redistribution, so they
 * are reported but never required — a fresh clone will not have them.
 *
 *   npm run check:avatars
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { AVATAR_PRESETS, PROJECT_AUTHOR } from "../src/lib/avatar/presets";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Mirrors REQUIRED_BONES in src/lib/avatar/boneMapping.ts.
const REQUIRED = ["hips", "head", "leftUpperArm", "rightUpperArm", "leftLowerArm", "rightLowerArm"];
const EXPECTED = [
  "leftHand", "rightHand", "leftUpperLeg", "rightUpperLeg",
  "leftLowerLeg", "rightLowerLeg", "leftFoot", "rightFoot", "neck", "spine",
];
const FINGERS = ["leftThumbProximal", "leftIndexProximal", "rightIndexProximal"];

interface GltfJson {
  extensions?: {
    VRMC_vrm?: {
      humanoid?: { humanBones?: Record<string, unknown> };
      expressions?: { preset?: Record<string, unknown> };
      meta?: {
        authors?: string[];
        allowRedistribution?: boolean;
        creditNotation?: string;
      };
    };
  };
}

function parseGlbJson(buf: Buffer): GltfJson {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("glb 헤더가 아닙니다");
  let offset = 12;
  while (offset < buf.byteLength) {
    const len = dv.getUint32(offset, true);
    const type = dv.getUint32(offset + 4, true);
    const start = offset + 8;
    if (type === 0x4e4f534a) {
      return JSON.parse(buf.subarray(start, start + len).toString("utf8")) as GltfJson;
    }
    offset = start + len;
  }
  throw new Error("JSON 청크를 찾지 못했습니다");
}

let failures = 0;
const check = (label: string, ok: boolean, detail: string) => {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : " FAIL "} ${label} — ${detail}`);
};

let bundledBytes = 0;
let localOnly = 0;

for (const preset of AVATAR_PRESETS) {
  const vrm = join(root, "public/avatars", `${preset.id}.vrm`);
  const thumb = join(root, "public/avatars/thumbs", `${preset.id}.jpg`);
  const present = existsSync(vrm);

  if (!present) {
    if (preset.bundled) {
      check(preset.id, false, "vrm 파일이 없습니다");
    } else {
      localOnly++;
      console.log(`  --   ${preset.id} — 로컬 전용 (재배포 금지), 이 기기에는 없음`);
    }
    continue;
  }
  if (preset.bundled) bundledBytes += statSync(vrm).size;
  else localOnly++;

  const json = parseGlbJson(readFileSync(vrm));
  const vrmExt = json.extensions?.VRMC_vrm;
  const bones = vrmExt?.humanoid?.humanBones ?? {};
  const missing = REQUIRED.filter((b) => !bones[b]);
  const missingExpected = EXPECTED.filter((b) => !bones[b]);
  const fingers = FINGERS.filter((b) => bones[b]).length;
  const expressions = Object.keys(vrmExt?.expressions?.preset ?? {});
  const meta = vrmExt?.meta;

  const authors = meta?.authors ?? [];

  // allowRedistribution restrains third parties, not the author, so it only
  // blocks a commit when the file was made by somebody else. Metadata drifts
  // silently on re-export, which is exactly when this matters.
  const thirdParty = authors.length > 0 && !authors.includes(PROJECT_AUTHOR);
  if (preset.bundled && thirdParty && meta?.allowRedistribution === false) {
    check(
      `${preset.id} 라이선스`,
      false,
      `"${authors.join(", ")}" 의 모델인데 allowRedistribution: false — 저장소에 포함할 수 없습니다`,
    );
  }
  if (preset.author && authors.length > 0 && !authors.includes(preset.author)) {
    check(
      `${preset.id} 제작자 표기`,
      false,
      `카탈로그 "${preset.author}" vs 파일 "${authors.join(", ")}"`,
    );
  }
  if (!preset.author && meta?.creditNotation === "required") {
    check(`${preset.id} 크레딧`, false, "creditNotation: required 인데 author 가 없습니다");
  }

  check(
    `${preset.id}${preset.bundled ? "" : " (로컬 전용)"}`,
    vrmExt !== undefined && missing.length === 0 && existsSync(thumb),
    [
      vrmExt ? "VRM 1.0" : "VRM 확장 없음",
      missing.length ? `필수 본 누락 ${missing.join(",")}` : `본 ${Object.keys(bones).length}개`,
      missingExpected.length ? `선택 본 누락 ${missingExpected.length}` : "전신",
      `손가락 ${fingers}/${FINGERS.length}`,
      `표정 ${expressions.length}개`,
      existsSync(thumb) ? `썸네일 ${(statSync(thumb).size / 1024).toFixed(0)}KB` : "썸네일 없음",
      `재배포 ${meta?.allowRedistribution ? "허용" : "금지"}`,
    ].join(" · "),
  );
}

console.log(
  failures === 0
    ? `\n전부 통과했습니다. 저장소 포함 ${(bundledBytes / 1048576).toFixed(0)}MB · 로컬 전용 ${localOnly}개\n`
    : `\n${failures}개 실패했습니다.\n`,
);
process.exit(failures === 0 ? 0 : 1);
