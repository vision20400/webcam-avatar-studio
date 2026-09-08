/**
 * Headless sanity check for the landmark -> bone pipeline.
 *
 * Feeds synthetic MediaPipe world landmarks through the same conversion the
 * tracker uses, runs the real solver against the built-in mannequin, and
 * asserts the avatar ends up in the pose a human would expect. This is where
 * the coordinate-system reasoning (+x = avatar's left, +z = toward camera,
 * mirror = negate x and swap sides) actually gets tested.
 *
 *   npm run check:rig
 */
import * as THREE from "three";

import { mapHumanoidBones, missingRequiredBones } from "../src/lib/avatar/boneMapping";
import { buildHumanoidRig } from "../src/lib/avatar/humanoid";
import { createMannequin } from "../src/lib/avatar/mannequin";
import { PoseSolver } from "../src/lib/avatar/solver";
import { MIRROR_PAIRS } from "../src/lib/tracking/landmarks";
import type { JointName, Joints, TrackFrame, Vec3 } from "../src/lib/types";

type MPPoint = [number, number, number];

/** Person facing the camera, right arm straight up, left arm down. */
const RAW: Partial<Record<JointName, MPPoint>> = {
  nose: [0, -0.62, -0.1],
  leftEar: [0.08, -0.6, 0.02],
  rightEar: [-0.08, -0.6, 0.02],
  leftShoulder: [0.18, -0.5, 0],
  rightShoulder: [-0.18, -0.5, 0],
  leftElbow: [0.22, -0.22, 0],
  rightElbow: [-0.2, -0.78, 0],
  leftWrist: [0.24, 0.05, 0],
  rightWrist: [-0.22, -1.05, 0],
  leftIndex: [0.25, 0.13, 0],
  rightIndex: [-0.23, -1.13, 0],
  leftHip: [0.1, 0, 0],
  rightHip: [-0.1, 0, 0],
  leftKnee: [0.1, 0.45, 0],
  rightKnee: [-0.1, 0.45, 0],
  leftAnkle: [0.1, 0.9, 0],
  rightAnkle: [-0.1, 0.9, 0],
  leftFootIndex: [0.1, 0.95, -0.12],
  rightFootIndex: [-0.1, 0.95, -0.12],
};

/** Same person, arms straight out to the sides. */
const T_POSE: Partial<Record<JointName, MPPoint>> = {
  ...RAW,
  leftElbow: [0.45, -0.5, 0],
  rightElbow: [-0.45, -0.5, 0],
  leftWrist: [0.7, -0.5, 0],
  rightWrist: [-0.7, -0.5, 0],
  leftIndex: [0.78, -0.5, 0],
  rightIndex: [-0.78, -0.5, 0],
};

const MIRROR_LOOKUP = new Map<JointName, JointName>();
for (const [a, b] of MIRROR_PAIRS) {
  MIRROR_LOOKUP.set(a, b);
  MIRROR_LOOKUP.set(b, a);
}

/** Same conversion as Tracker.process: MediaPipe world -> avatar space. */
function buildFrame(
  mirror: boolean,
  raw: Partial<Record<JointName, MPPoint>> = RAW,
): TrackFrame {
  const joints: Joints = {};
  const confidence: Partial<Record<JointName, number>> = {};
  for (const [name, p] of Object.entries(raw) as [JointName, MPPoint][]) {
    const target = mirror ? (MIRROR_LOOKUP.get(name) ?? name) : name;
    const v: Vec3 = { x: mirror ? -p[0] : p[0], y: -p[1], z: -p[2] };
    joints[target] = v;
    confidence[target] = 1;
  }
  return {
    ts: 0,
    hasPose: true,
    hasFace: false,
    joints,
    confidence,
    headQuat: null,
    blendshapes: {},
    hands: { left: null, right: null },
    rootOffset: { x: 0, y: 0, z: 0 },
    overlay: { pose: null, face: null, hands: [] },
  };
}

function settle(
  mirror: boolean,
  raw?: Partial<Record<JointName, MPPoint>>,
  prepare?: (rig: ReturnType<typeof createMannequin>) => void,
) {
  const rig = createMannequin();
  prepare?.(rig);
  const solver = new PoseSolver(rig);
  solver.settings.followBody = 0;
  const frame = buildFrame(mirror, raw);
  for (let i = 0; i < 240; i++) solver.apply(frame, 1 / 60);
  rig.root.updateMatrixWorld(true);
  const at = (name: Parameters<typeof rig.getBone>[0]) => {
    const b = rig.getBone(name);
    if (!b) throw new Error(`missing bone ${name}`);
    return b.getWorldPosition(new THREE.Vector3());
  };
  return { rig, at };
}

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : " FAIL "} ${label} — ${detail}`);
}

console.log("\n입력: 사람이 카메라를 보고 오른팔을 위로 든 자세\n");

{
  console.log("거울 모드 끔 (아바타가 사람과 같은 쪽 팔을 듦)");
  const { at } = settle(false);
  const rHand = at("rightHand");
  const lHand = at("leftHand");
  const rShoulder = at("rightUpperArm");

  check(
    "오른손이 어깨 위로 올라감",
    rHand.y > rShoulder.y + 0.25,
    `hand.y=${rHand.y.toFixed(3)} vs shoulder.y=${rShoulder.y.toFixed(3)}`,
  );
  check(
    "오른손이 아바타 오른쪽(-x)에 있음",
    rHand.x < -0.05,
    `hand.x=${rHand.x.toFixed(3)}`,
  );
  check(
    "왼손은 내려가 있음",
    lHand.y < rHand.y - 0.5,
    `left.y=${lHand.y.toFixed(3)} right.y=${rHand.y.toFixed(3)}`,
  );
}

{
  console.log("\n거울 모드 켬 (화면상 같은 쪽 = 아바타의 왼팔)");
  const { at } = settle(true);
  const rHand = at("rightHand");
  const lHand = at("leftHand");

  check(
    "왼손이 올라감",
    lHand.y > rHand.y + 0.5,
    `left.y=${lHand.y.toFixed(3)} right.y=${rHand.y.toFixed(3)}`,
  );
  check(
    "올라간 손이 화면 오른쪽(+x)에 있음",
    lHand.x > 0.05,
    `left.x=${lHand.x.toFixed(3)}`,
  );
}

{
  console.log("\n정면 확인 (아바타가 카메라 쪽 +z 를 향함)");
  const { rig, at } = settle(false);
  rig.root.updateMatrixWorld(true);
  const chest = rig.getBone("chest")!;
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(
    chest.getWorldQuaternion(new THREE.Quaternion()),
  );
  check("가슴이 +z 를 봄", forward.z > 0.9, `forward.z=${forward.z.toFixed(3)}`);

  const hips = at("hips");
  check(
    "엉덩이가 기본 높이를 유지",
    Math.abs(hips.y - 0.92) < 0.02,
    `hips.y=${hips.y.toFixed(3)}`,
  );
}

{
  console.log("\n비표준 rest 포즈 (A-포즈로 만들어진 모델 흉내)");
  // Drop both upper arms 45 degrees at rest, then feed a real T-pose. A rig
  // that only works from an identity rest would leave the arms hanging.
  const aPose = (rig: ReturnType<typeof createMannequin>) => {
    for (const [name, sign] of [
      ["leftUpperArm", -1],
      ["rightUpperArm", 1],
    ] as const) {
      rig
        .getBone(name)!
        .quaternion.setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          (sign * Math.PI) / 4,
        );
    }
  };
  const { at } = settle(false, T_POSE, aPose);
  const lHand = at("leftHand");
  const shoulder = at("leftUpperArm");
  check(
    "T-포즈 입력에 팔이 수평으로 펴짐",
    Math.abs(lHand.y - shoulder.y) < 0.12,
    `hand.y=${lHand.y.toFixed(3)} shoulder.y=${shoulder.y.toFixed(3)}`,
  );
  check(
    "손이 몸에서 충분히 멀어짐",
    lHand.x > 0.45,
    `hand.x=${lHand.x.toFixed(3)}`,
  );
}

// --- glb / fbx 본 이름 자동 매핑 ------------------------------------------
// VRM 은 어느 노드가 "왼쪽 위팔"인지 파일에 적어두지만 glTF·FBX 는 아니라서,
// 실제로 쓰이는 이름 규칙들을 이름만 보고 알아맞혀야 합니다.
const RIGS: Record<string, string[]> = {
  Mixamo: [
    "mixamorig:Hips", "mixamorig:Spine", "mixamorig:Spine1", "mixamorig:Spine2",
    "mixamorig:Neck", "mixamorig:Head", "mixamorig:HeadTop_End",
    "mixamorig:LeftShoulder", "mixamorig:LeftArm", "mixamorig:LeftForeArm", "mixamorig:LeftHand",
    "mixamorig:LeftHandThumb1", "mixamorig:LeftHandThumb2", "mixamorig:LeftHandThumb3",
    "mixamorig:LeftHandIndex1", "mixamorig:LeftHandIndex2", "mixamorig:LeftHandIndex3",
    "mixamorig:LeftHandPinky1",
    "mixamorig:RightShoulder", "mixamorig:RightArm", "mixamorig:RightForeArm", "mixamorig:RightHand",
    "mixamorig:LeftUpLeg", "mixamorig:LeftLeg", "mixamorig:LeftFoot", "mixamorig:LeftToeBase",
    "mixamorig:RightUpLeg", "mixamorig:RightLeg", "mixamorig:RightFoot", "mixamorig:RightToeBase",
  ],
  Unreal: [
    "pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "head",
    "clavicle_l", "upperarm_l", "lowerarm_l", "hand_l",
    "thumb_01_l", "thumb_02_l", "thumb_03_l", "index_01_l", "middle_01_l", "pinky_01_l",
    "clavicle_r", "upperarm_r", "lowerarm_r", "hand_r",
    "thigh_l", "calf_l", "foot_l", "ball_l",
    "thigh_r", "calf_r", "foot_r", "ball_r",
  ],
  VRoid: [
    "J_Bip_C_Hips", "J_Bip_C_Spine", "J_Bip_C_Chest", "J_Bip_C_UpperChest",
    "J_Bip_C_Neck", "J_Bip_C_Head", "J_Adj_L_FaceEye", "J_Adj_R_FaceEye",
    "J_Bip_L_Shoulder", "J_Bip_L_UpperArm", "J_Bip_L_LowerArm", "J_Bip_L_Hand",
    "J_Bip_L_Thumb1", "J_Bip_L_Index1", "J_Bip_L_Index2", "J_Bip_L_Index3",
    "J_Bip_R_Shoulder", "J_Bip_R_UpperArm", "J_Bip_R_LowerArm", "J_Bip_R_Hand",
    "J_Bip_L_UpperLeg", "J_Bip_L_LowerLeg", "J_Bip_L_Foot", "J_Bip_L_ToeBase",
    "J_Bip_R_UpperLeg", "J_Bip_R_LowerLeg", "J_Bip_R_Foot", "J_Bip_R_ToeBase",
  ],
  Blender: [
    "DEF-spine", "DEF-spine.001", "DEF-spine.002", "DEF-spine.003",
    "DEF-neck", "DEF-head",
    "DEF-shoulder.L", "DEF-upper_arm.L", "DEF-forearm.L", "DEF-hand.L",
    "DEF-shoulder.R", "DEF-upper_arm.R", "DEF-forearm.R", "DEF-hand.R",
    "DEF-thigh.L", "DEF-shin.L", "DEF-foot.L", "DEF-toe.L",
    "DEF-thigh.R", "DEF-shin.R", "DEF-foot.R", "DEF-toe.R",
    "thumb.01.L", "f_index.01.L",
  ],
};

console.log("\n본 이름 자동 매핑 (glb · fbx)");
for (const [rig, names] of Object.entries(RIGS)) {
  const mapping = mapHumanoidBones(names);
  const missing = missingRequiredBones(mapping);
  check(
    `${rig}: 필수 본을 모두 인식`,
    missing.length === 0,
    missing.length ? `누락 ${missing.join(", ")}` : `${mapping.matched}개 인식`,
  );
}

{
  const m = mapHumanoidBones(RIGS.Mixamo);
  check(
    "Mixamo: LeftArm 은 위팔, LeftForeArm 은 아래팔",
    m.bones.leftUpperArm === "mixamorig:LeftArm" &&
      m.bones.leftLowerArm === "mixamorig:LeftForeArm",
    `${m.bones.leftUpperArm} / ${m.bones.leftLowerArm}`,
  );
  check(
    "Mixamo: LeftUpLeg 은 허벅지, LeftLeg 은 종아리",
    m.bones.leftUpperLeg === "mixamorig:LeftUpLeg" &&
      m.bones.leftLowerLeg === "mixamorig:LeftLeg",
    `${m.bones.leftUpperLeg} / ${m.bones.leftLowerLeg}`,
  );
  check(
    "Mixamo: 손가락 마디까지 매핑",
    m.bones.leftIndexProximal === "mixamorig:LeftHandIndex1" &&
      m.bones.leftIndexDistal === "mixamorig:LeftHandIndex3",
    `${m.bones.leftIndexProximal} … ${m.bones.leftIndexDistal}`,
  );
  check(
    "Mixamo: HeadTop_End 같은 말단 본은 무시",
    m.bones.head === "mixamorig:Head",
    `head=${m.bones.head}`,
  );
}

{
  const m = mapHumanoidBones(RIGS.Unreal);
  check(
    "Unreal: spine_01/02/03 을 spine·chest·upperChest 로 분배",
    m.bones.spine === "spine_01" &&
      m.bones.chest === "spine_02" &&
      m.bones.upperChest === "spine_03",
    `${m.bones.spine} / ${m.bones.chest} / ${m.bones.upperChest}`,
  );
  check(
    "Unreal: 좌우를 _l / _r 접미사로 구분",
    m.bones.leftUpperArm === "upperarm_l" && m.bones.rightUpperArm === "upperarm_r",
    `${m.bones.leftUpperArm} / ${m.bones.rightUpperArm}`,
  );
  check("Unreal: neck_01 인식", m.bones.neck === "neck_01", `neck=${m.bones.neck}`);
}

{
  const m = mapHumanoidBones(RIGS.VRoid);
  check(
    "VRoid: J_Bip_C_ 접두사를 벗겨냄",
    m.bones.hips === "J_Bip_C_Hips" && m.bones.upperChest === "J_Bip_C_UpperChest",
    `${m.bones.hips} / ${m.bones.upperChest}`,
  );
  check(
    "VRoid: 눈 본을 따로 찾아냄",
    m.eyes.left === "J_Adj_L_FaceEye" && m.eyes.right === "J_Adj_R_FaceEye",
    `${m.eyes.left} / ${m.eyes.right}`,
  );
}

{
  const m = mapHumanoidBones(RIGS.Blender);
  check(
    "Blender: 골반 본이 없으면 척추 체인의 첫 본을 골반으로",
    m.bones.hips === "DEF-spine" && m.bones.spine === "DEF-spine.001",
    `hips=${m.bones.hips} spine=${m.bones.spine}`,
  );
  check(
    "Blender: upper_arm.L / shin.L 같은 접미사 표기 인식",
    m.bones.leftUpperArm === "DEF-upper_arm.L" &&
      m.bones.leftLowerLeg === "DEF-shin.L",
    `${m.bones.leftUpperArm} / ${m.bones.leftLowerLeg}`,
  );
}

check(
  "좌우 표시가 없는 뼈대는 거부",
  missingRequiredBones(mapHumanoidBones(["Bone", "Bone.001", "Cube"])).length > 0,
  "필수 본 누락으로 처리",
);

// --- 합성 glb 스켈레톤 전체 경로 -------------------------------------------
// 실제 glTF·FBX 캐릭터가 지키지 않는 세 가지(정면 방향, 단위, 바닥 높이)를
// 일부러 어긋나게 만든 뼈대를 넣어, 로더가 정규화하는지 확인합니다.
function syntheticMixamoRig() {
  const armature = new THREE.Object3D();
  armature.name = "Armature";
  // 센티미터 단위 + 카메라 반대쪽(-z)을 보는, 흔한 내보내기 형태
  armature.scale.setScalar(100);
  armature.rotation.y = Math.PI;

  const bone = (name: string, parent: THREE.Object3D, p: [number, number, number]) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(...p);
    parent.add(b);
    return b;
  };

  const hips = bone("mixamorig:Hips", armature, [0, 0.92, 0]);
  const spine = bone("mixamorig:Spine", hips, [0, 0.1, 0]);
  const spine1 = bone("mixamorig:Spine1", spine, [0, 0.13, 0]);
  const spine2 = bone("mixamorig:Spine2", spine1, [0, 0.12, 0]);
  const neck = bone("mixamorig:Neck", spine2, [0, 0.1, 0]);
  const head = bone("mixamorig:Head", neck, [0, 0.08, 0]);
  bone("mixamorig:HeadTop_End", head, [0, 0.18, 0]);

  for (const [side, sx] of [["Left", 1], ["Right", -1]] as const) {
    const shoulder = bone(`mixamorig:${side}Shoulder`, spine2, [sx * 0.045, 0.06, 0]);
    const arm = bone(`mixamorig:${side}Arm`, shoulder, [sx * 0.115, 0, 0]);
    const fore = bone(`mixamorig:${side}ForeArm`, arm, [sx * 0.25, 0, 0]);
    const hand = bone(`mixamorig:${side}Hand`, fore, [sx * 0.24, 0, 0]);
    bone(`mixamorig:${side}HandMiddle1`, hand, [sx * 0.066, 0, 0.009]);

    const upLeg = bone(`mixamorig:${side}UpLeg`, hips, [sx * 0.085, -0.05, 0]);
    const leg = bone(`mixamorig:${side}Leg`, upLeg, [0, -0.42, 0]);
    const foot = bone(`mixamorig:${side}Foot`, leg, [0, -0.4, 0]);
    bone(`mixamorig:${side}ToeBase`, foot, [0, -0.02, 0.1]);
  }
  return armature;
}

console.log("\n합성 glb 스켈레톤 (cm 단위 · 뒤를 보고 있음)");
{
  const rig = buildHumanoidRig(syntheticMixamoRig(), "합성 리그");
  rig.root.updateMatrixWorld(true);
  const at = (name: Parameters<typeof rig.getBone>[0]) =>
    rig.getBone(name)!.getWorldPosition(new THREE.Vector3());

  const head = at("head");
  const hips = at("hips");
  check(
    "키를 1.7m 로 정규화",
    Math.abs(rig.metrics.height - 1.7) < 0.01 && head.y > 1.3 && head.y < 1.75,
    `height=${rig.metrics.height.toFixed(2)} head.y=${head.y.toFixed(3)}`,
  );
  // 메시가 없는 합성 뼈대라 Box3 대신 가장 낮은 본으로 바닥을 확인합니다.
  const lowestBone = Math.min(at("leftToes").y, at("rightToes").y);
  check(
    "가장 낮은 본이 바닥(y=0)에 놓임",
    Math.abs(lowestBone) < 0.02,
    `lowest=${lowestBone.toFixed(4)}`,
  );
  check(
    "골반이 원점 위에 정렬",
    Math.abs(hips.x) < 0.01 && Math.abs(hips.z) < 0.01,
    `hips=(${hips.x.toFixed(3)}, ${hips.z.toFixed(3)})`,
  );
  check(
    "-z 를 보던 모델이 카메라(+z) 쪽으로 돌아감",
    at("leftUpperArm").x > 0.05 && at("rightUpperArm").x < -0.05,
    `leftArm.x=${at("leftUpperArm").x.toFixed(3)} rightArm.x=${at("rightUpperArm").x.toFixed(3)}`,
  );

  // 그리고 이 리그를 실제 솔버로 돌렸을 때 마네킹과 같은 결과가 나와야 합니다.
  const solver = new PoseSolver(rig);
  solver.settings.followBody = 0;
  const frame = buildFrame(false);
  for (let i = 0; i < 240; i++) solver.apply(frame, 1 / 60);
  rig.root.updateMatrixWorld(true);
  check(
    "솔버가 오른팔을 들어올림",
    at("rightHand").y > at("rightUpperArm").y + 0.2 && at("rightHand").x < 0,
    `hand=(${at("rightHand").x.toFixed(3)}, ${at("rightHand").y.toFixed(3)})`,
  );
}

console.log(
  failures === 0
    ? "\n전부 통과했습니다.\n"
    : `\n${failures}개 실패했습니다.\n`,
);
process.exit(failures === 0 ? 0 : 1);
