import { fingerBone, type BoneName, type FingerName, type Side } from "./rig";

/**
 * Guesses a humanoid bone mapping from raw skeleton node names.
 *
 * VRM files declare which node is "left upper arm"; plain glTF/FBX does not, so
 * we have to recognise the naming conventions in the wild:
 *
 *   Mixamo / Ready Player Me   mixamorig:LeftForeArm, LeftHandThumb1
 *   Unreal                     lowerarm_l, thumb_01_l, calf_l
 *   VRoid glb                  J_Bip_L_LowerArm
 *   Blender / Rigify           DEF-forearm.L, thumb.01.L
 *   VRM-ish                    leftLowerArm, leftThumbProximal
 *
 * Pure functions over strings, so the whole table is testable without loading
 * a model — see scripts/rig-check.mts.
 */

export interface BoneMapping {
  bones: Partial<Record<BoneName, string>>;
  eyes: { left?: string; right?: string };
  matched: number;
}

/** Strips rig-generator prefixes and every separator. */
export function normalizeBoneName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^mixamorig[:_]?\d*/, "")
    .replace(/^(def|org|mch|ctrl)[-_]/, "")
    // VRoid encodes the side in the prefix: J_Bip_C_Hips, J_Bip_L_UpperArm.
    .replace(/^j_(?:bip|sec|adj|opt)_c_/, "")
    .replace(/^j_(?:bip|sec|adj|opt)_l_/, "left")
    .replace(/^j_(?:bip|sec|adj|opt)_r_/, "right")
    .replace(/^j_(?:bip|sec|adj|opt)_/, "")
    .replace(/^(bip0*1|biped|b_)[\s_.:-]*/, "")
    .replace(/^(armature|root)[|_.]/, "")
    .replace(/[\s_.:|-]/g, "");
}

/**
 * Every plausible (side, core) split. "leftarm", "arml", "larm" and "arm" all
 * have to resolve; a wrong split simply fails to match anything downstream.
 */
export function sideCandidates(
  n: string,
): { side: Side | null; core: string }[] {
  const out: { side: Side | null; core: string }[] = [];
  const push = (side: Side, core: string) => {
    if (core.length >= 2) out.push({ side, core });
  };
  if (n.startsWith("left")) push("left", n.slice(4));
  if (n.startsWith("right")) push("right", n.slice(5));
  if (n.endsWith("left")) push("left", n.slice(0, -4));
  if (n.endsWith("right")) push("right", n.slice(0, -5));
  if (n.startsWith("l")) push("left", n.slice(1));
  if (n.startsWith("r")) push("right", n.slice(1));
  if (n.endsWith("l")) push("left", n.slice(0, -1));
  if (n.endsWith("r")) push("right", n.slice(0, -1));
  out.push({ side: null, core: n });
  return out;
}

/** Bones with no left/right counterpart. */
const CENTER_ALIASES: Record<string, BoneName> = {
  hips: "hips",
  hip: "hips",
  pelvis: "hips",
  cog: "hips",
  waist: "hips",
  chest: "chest",
  upperbody: "chest",
  upperchest: "upperChest",
  chest2: "upperChest",
  neck: "neck",
  head: "head",
};

type SidedRole =
  | "Shoulder"
  | "UpperArm"
  | "LowerArm"
  | "Hand"
  | "UpperLeg"
  | "LowerLeg"
  | "Foot"
  | "Toes"
  | "Eye";

/**
 * Note the traps: in Mixamo "Arm" is the *upper* arm and "Leg" is the *lower*
 * leg, so neither can be treated as a generic word.
 */
const SIDED_ALIASES: Record<string, SidedRole> = {
  shoulder: "Shoulder",
  clavicle: "Shoulder",
  collar: "Shoulder",
  upperarm: "UpperArm",
  arm: "UpperArm",
  armupper: "UpperArm",
  forearm: "LowerArm",
  lowerarm: "LowerArm",
  armlower: "LowerArm",
  hand: "Hand",
  wrist: "Hand",
  upleg: "UpperLeg",
  upperleg: "UpperLeg",
  thigh: "UpperLeg",
  legupper: "UpperLeg",
  leg: "LowerLeg",
  lowerleg: "LowerLeg",
  calf: "LowerLeg",
  shin: "LowerLeg",
  leglower: "LowerLeg",
  foot: "Foot",
  ankle: "Foot",
  toebase: "Toes",
  toe: "Toes",
  toes: "Toes",
  ball: "Toes",
  eye: "Eye",
  faceeye: "Eye",
};

const FINGER_ALIASES: Record<string, FingerName> = {
  thumb: "thumb",
  index: "index",
  middle: "middle",
  ring: "ring",
  little: "little",
  pinky: "little",
  pinkie: "little",
};

const SEGMENT_ALIASES: Record<string, "Metacarpal" | "Proximal" | "Intermediate" | "Distal"> =
  {
    metacarpal: "Metacarpal",
    proximal: "Proximal",
    intermediate: "Intermediate",
    middle: "Intermediate",
    distal: "Distal",
  };

/** Numeric finger segments: the thumb's first joint is a metacarpal. */
function numberedSegment(finger: FingerName, index: number) {
  const order =
    finger === "thumb"
      ? (["Metacarpal", "Proximal", "Distal"] as const)
      : (["Proximal", "Intermediate", "Distal"] as const);
  return order[index - 1] ?? null;
}

function matchFinger(side: Side, core: string): BoneName | null {
  const stripped = core.replace(/^hand/, "");
  const numeric = /^([a-z]+?)0*([1-4])$/.exec(stripped);
  if (numeric) {
    const finger = FINGER_ALIASES[numeric[1]];
    if (!finger) return null;
    const segment = numberedSegment(finger, Number(numeric[2]));
    return segment ? fingerBone(side, finger, segment) : null;
  }
  for (const [name, finger] of Object.entries(FINGER_ALIASES)) {
    if (!stripped.startsWith(name)) continue;
    const segment = SEGMENT_ALIASES[stripped.slice(name.length)];
    if (segment) return fingerBone(side, finger, segment);
  }
  return null;
}

/**
 * `names` should arrive in scene-graph order (parents first) so that, when two
 * nodes fit the same slot, the one nearer the root wins.
 */
export function mapHumanoidBones(names: string[]): BoneMapping {
  const bones: Partial<Record<BoneName, string>> = {};
  const eyes: { left?: string; right?: string } = {};
  const spineChain: { index: number; name: string }[] = [];

  const claim = (bone: BoneName, raw: string) => {
    if (!bones[bone]) bones[bone] = raw;
  };

  for (const raw of names) {
    const n = normalizeBoneName(raw);
    if (!n) continue;

    // Unreal numbers the neck too (neck_01), so strip the index before lookup.
    if (/^neck0*\d*$/.test(n)) {
      claim("neck", raw);
      continue;
    }

    const spine = /^spine0*(\d*)$/.exec(n);
    if (spine) {
      spineChain.push({ index: spine[1] ? Number(spine[1]) : 0, name: raw });
      continue;
    }

    const center = CENTER_ALIASES[n];
    if (center) {
      claim(center, raw);
      continue;
    }

    for (const { side, core } of sideCandidates(n)) {
      if (!side) break;
      const role = SIDED_ALIASES[core];
      if (role === "Eye") {
        if (!eyes[side]) eyes[side] = raw;
        break;
      }
      if (role) {
        claim(`${side}${role}` as BoneName, raw);
        break;
      }
      const finger = matchFinger(side, core);
      if (finger) {
        claim(finger, raw);
        break;
      }
    }
  }

  spineChain.sort((a, b) => a.index - b.index);

  // Rigify and friends ship no pelvis bone: the root of the spine chain is the
  // hips, and everything above it is the spine proper.
  if (!bones.hips && spineChain.length >= 2) {
    bones.hips = spineChain.shift()!.name;
  }

  // spine / spine1 / spine2 -> spine, chest, upperChest, filling only the
  // slots that explicit names did not already take.
  const slots: BoneName[] = ["spine", "chest", "upperChest"];
  const free = slots.filter((s) => !bones[s]);
  if (spineChain.length >= free.length) {
    free.forEach((slot, i) => {
      const pick =
        i === free.length - 1
          ? spineChain[spineChain.length - 1]
          : spineChain[i];
      if (pick) bones[slot] = pick.name;
    });
  } else {
    spineChain.forEach((entry, i) => {
      const slot = free[i];
      if (slot) bones[slot] = entry.name;
    });
  }

  return { bones, eyes, matched: Object.keys(bones).length };
}

/** Bones without which the solver has nothing to stand on. */
export const REQUIRED_BONES: BoneName[] = [
  "hips",
  "head",
  "leftUpperArm",
  "rightUpperArm",
  "leftLowerArm",
  "rightLowerArm",
];

export function missingRequiredBones(mapping: BoneMapping): BoneName[] {
  return REQUIRED_BONES.filter((b) => !mapping.bones[b]);
}
