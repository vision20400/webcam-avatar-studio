import type { ModelFormat } from "./format";

export type Gender = "female" | "male";

export interface AvatarPreset {
  id: string;
  label: string;
  gender: Gender;
  url: string;
  thumb: string;
  format: ModelFormat;
}

/**
 * VRM 1.0 avatars bundled with the app, so the studio is usable without
 * sourcing a model first. Files live in public/avatars; thumbnails come from
 * each VRM's own metadata via scripts/extract-vrm-thumbnails.mjs.
 */
const FILES: { id: string; label: string; gender: Gender }[] = [
  { id: "01-female-cute", label: "큐트", gender: "female" },
  { id: "02-female-athletic", label: "스포티", gender: "female" },
  { id: "03-female-calm", label: "차분", gender: "female" },
  { id: "04-female-fantasy", label: "판타지", gender: "female" },
  { id: "05-male-cute", label: "큐트", gender: "male" },
  { id: "06-male-strong", label: "강인", gender: "male" },
  { id: "07-male-calm", label: "차분", gender: "male" },
  { id: "08-male-fantasy", label: "판타지", gender: "male" },
];

export const AVATAR_PRESETS: AvatarPreset[] = FILES.map((f) => ({
  ...f,
  url: `/avatars/${f.id}.vrm`,
  thumb: `/avatars/thumbs/${f.id}.jpg`,
  format: "vrm" as const,
}));

export const DEFAULT_PRESET = AVATAR_PRESETS[0];

export const GENDER_LABEL: Record<Gender, string> = {
  female: "여성",
  male: "남성",
};

export function findPreset(id: string | null): AvatarPreset | null {
  if (!id) return null;
  return AVATAR_PRESETS.find((p) => p.id === id) ?? null;
}
