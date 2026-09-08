import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import {
  mapHumanoidBones,
  missingRequiredBones,
  type BoneMapping,
} from "./boneMapping";
import type { ModelFormat } from "./format";
import type { AvatarRig, BoneName, ExpressionName, RigMetrics } from "./rig";

/** Everything gets normalised to this standing height so framing stays sane. */
const TARGET_HEIGHT = 1.7;
const MAX_GAZE_YAW = THREE.MathUtils.degToRad(20);
const MAX_GAZE_PITCH = THREE.MathUtils.degToRad(14);

export type HumanoidFormat = Exclude<ModelFormat, "vrm">;

/** Morph-target presets, for models without ARKit blendshapes. */
const MORPH_PRESETS: Record<ExpressionName, string[]> = {
  aa: ["jawopen", "mouthopen", "visemeaa", "vrcvisemeaa", "a"],
  ih: ["visemeih", "visemei", "i"],
  ou: ["mouthpucker", "visemeou", "visemeu", "u"],
  ee: ["visemeee", "visemee", "e"],
  oh: ["visemeoh", "visemeo", "o"],
  blinkLeft: ["eyeblinkleft", "blinkleft", "eyeclosedleft", "winkleft"],
  blinkRight: ["eyeblinkright", "blinkright", "eyeclosedright", "winkright"],
  happy: ["mouthsmile", "mouthsmileleft", "mouthsmileright", "happy", "smile", "joy"],
  sad: ["mouthfrownleft", "mouthfrownright", "sad", "sorrow"],
  angry: ["browdownleft", "browdownright", "angry"],
  surprised: ["browinnerup", "eyewideleft", "eyewideright", "surprised"],
  relaxed: ["relaxed", "fun"],
};

const morphKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Vertical extent of the avatar. Box3.setFromObject only sees geometry, and it
 * comes back empty for skeleton-only files or meshes with no bounding box — an
 * empty box then yields an infinite height and an avatar scaled into oblivion,
 * so fall back to measuring the bones themselves.
 */
function verticalSpan(
  root: THREE.Object3D,
  bones: Map<BoneName, THREE.Object3D>,
): { min: number; max: number } {
  const box = new THREE.Box3().setFromObject(root);
  if (Number.isFinite(box.min.y) && box.max.y - box.min.y > 1e-4) {
    return { min: box.min.y, max: box.max.y };
  }

  const p = new THREE.Vector3();
  let min = Infinity;
  let max = -Infinity;
  for (const bone of bones.values()) {
    bone.getWorldPosition(p);
    min = Math.min(min, p.y);
    max = Math.max(max, p.y);
  }
  if (!Number.isFinite(min) || max - min < 1e-4) return { min: 0, max: TARGET_HEIGHT };

  // Bones stop at the head joint; allow for the skull above it.
  const head = bones.get("head");
  const hips = bones.get("hips");
  if (head && hips) {
    const torso = head.getWorldPosition(p).y - hips.getWorldPosition(new THREE.Vector3()).y;
    max += Math.max(0, torso) * 0.3;
  }
  return { min, max };
}

interface MorphTarget {
  mesh: THREE.Mesh;
  index: number;
}

export async function loadHumanoidRig(
  url: string,
  displayName: string,
  format: HumanoidFormat,
  onProgress?: (ratio: number) => void,
): Promise<AvatarRig> {
  const progress = (e: ProgressEvent) => {
    if (e.total > 0) onProgress?.(e.loaded / e.total);
  };
  const model =
    format === "fbx"
      ? await new FBXLoader().loadAsync(url, progress)
      : (await new GLTFLoader().loadAsync(url, progress)).scene;
  return buildHumanoidRig(model, displayName);
}

/**
 * Turns an already-loaded scene into a rig the solver can drive. Split out from
 * the loader so it can be exercised against a synthetic skeleton — see
 * scripts/rig-check.mts.
 */
export function buildHumanoidRig(
  model: THREE.Object3D,
  displayName: string,
): AvatarRig {
  // --- find the skeleton ----------------------------------------------------
  const nodes: THREE.Object3D[] = [];
  model.traverse((o) => {
    if (o.name) nodes.push(o);
  });
  const boneNodes = nodes.filter((o) => (o as THREE.Bone).isBone);
  const candidates = boneNodes.length > 0 ? boneNodes : nodes;
  if (candidates.length === 0) {
    throw new Error(
      "이 파일에는 뼈대(스켈레톤)가 없습니다. 리깅된 캐릭터 모델이어야 아바타로 쓸 수 있습니다.",
    );
  }

  const mapping: BoneMapping = mapHumanoidBones(candidates.map((o) => o.name));
  const missing = missingRequiredBones(mapping);
  if (missing.length > 0) {
    throw new Error(
      `휴머노이드 본을 찾지 못했습니다 (${missing.join(", ")}). ` +
        `본 이름이 Mixamo·Unreal·VRM 중 하나의 규칙을 따라야 자동 인식됩니다. ` +
        `인식된 본: ${mapping.matched}개.`,
    );
  }

  const byName = new Map<string, THREE.Object3D>();
  for (const node of candidates) if (!byName.has(node.name)) byName.set(node.name, node);
  const bones = new Map<BoneName, THREE.Object3D>();
  for (const [bone, nodeName] of Object.entries(mapping.bones) as [BoneName, string][]) {
    const node = byName.get(nodeName);
    if (node) bones.set(bone, node);
  }
  const eyeBones = {
    left: mapping.eyes.left ? byName.get(mapping.eyes.left) : undefined,
    right: mapping.eyes.right ? byName.get(mapping.eyes.right) : undefined,
  };

  // --- normalise orientation, scale and floor contact -----------------------
  // The solver assumes the rest pose already faces +z at 1:1 scale with the
  // feet on y=0; glTF/FBX characters honour none of that reliably.
  const root = new THREE.Group();
  root.name = displayName;
  const pivot = new THREE.Group();
  pivot.add(model);
  root.add(pivot);
  root.updateMatrixWorld(true);

  const world = (bone: BoneName) =>
    bones.get(bone)!.getWorldPosition(new THREE.Vector3());
  const sideAxis = world("leftUpperArm").sub(world("rightUpperArm"));
  const up = world("head").sub(world("hips"));
  const forward = new THREE.Vector3().crossVectors(sideAxis, up);
  forward.y = 0;
  if (forward.lengthSq() > 1e-8) {
    pivot.rotation.y = -Math.atan2(forward.x, forward.z);
    root.updateMatrixWorld(true);
  }

  const span = verticalSpan(root, bones);
  const height = span.max - span.min;
  if (height > 1e-4) {
    pivot.scale.setScalar(TARGET_HEIGHT / height);
    root.updateMatrixWorld(true);
  }

  const placed = verticalSpan(root, bones);
  const hipsXZ = world("hips");
  pivot.position.x -= hipsXZ.x;
  pivot.position.z -= hipsXZ.z;
  pivot.position.y -= placed.min;
  root.updateMatrixWorld(true);

  const metrics: RigMetrics = {
    height: TARGET_HEIGHT,
    headY: world("head").y,
    hipY: world("hips").y,
  };

  // --- morph targets --------------------------------------------------------
  const morphs = new Map<string, MorphTarget[]>();
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.morphTargetDictionary) return;
    mesh.frustumCulled = false;
    for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
      const key = morphKey(name);
      const list = morphs.get(key) ?? [];
      list.push({ mesh, index });
      morphs.set(key, list);
    }
  });

  // Models exported with ARKit shapes take MediaPipe's 52 scores verbatim,
  // which is far richer than squeezing them through the VRM preset set first.
  const hasArkit =
    morphs.has("jawopen") &&
    (morphs.has("eyeblinkleft") || morphs.has("eyeblinkright"));

  const presetTargets = new Map<ExpressionName, MorphTarget[]>();
  for (const [expression, candidates] of Object.entries(MORPH_PRESETS) as [
    ExpressionName,
    string[],
  ][]) {
    const found = candidates.flatMap((c) => morphs.get(c) ?? []);
    if (found.length > 0) presetTargets.set(expression, found);
  }

  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  // --- rest pose ------------------------------------------------------------
  const restLocal = new Map<THREE.Object3D, THREE.Quaternion>();
  for (const bone of bones.values()) restLocal.set(bone, bone.quaternion.clone());
  for (const eye of [eyeBones.left, eyeBones.right]) {
    if (eye) restLocal.set(eye, eye.quaternion.clone());
  }

  const pending = new Map<MorphTarget[], number>();
  let gazeYaw = 0;
  let gazePitch = 0;

  const applyMorphs = () => {
    for (const [targets, value] of pending) {
      for (const t of targets) {
        if (t.mesh.morphTargetInfluences) t.mesh.morphTargetInfluences[t.index] = value;
      }
    }
    pending.clear();
  };

  return {
    root,
    name: displayName,
    metrics,
    getBone: (name) => bones.get(name) ?? null,
    resetPose() {
      for (const [bone, q] of restLocal) bone.quaternion.copy(q);
      root.position.set(0, 0, 0);
    },
    setExpression(name, weight) {
      if (hasArkit) return; // driven by setRawBlendshapes instead
      const targets = presetTargets.get(name);
      if (targets) pending.set(targets, weight);
    },
    setRawBlendshapes: hasArkit
      ? (values) => {
          for (const [name, value] of Object.entries(values)) {
            const targets = morphs.get(morphKey(name));
            if (targets) pending.set(targets, value);
          }
        }
      : undefined,
    setGaze(yaw, pitch) {
      gazeYaw = yaw;
      gazePitch = pitch;
    },
    update() {
      applyMorphs();
      const offset = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-gazePitch * MAX_GAZE_PITCH, gazeYaw * MAX_GAZE_YAW, 0, "YXZ"),
      );
      for (const eye of [eyeBones.left, eyeBones.right]) {
        if (!eye) continue;
        eye.quaternion.copy(restLocal.get(eye)!).multiply(offset);
      }
    },
    dispose() {
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose();
      });
      root.removeFromParent();
    },
  };
}
