import type { ModelFormat } from "./format";

export type Gender = "female" | "male";

export interface AvatarPreset {
  id: string;
  label: string;
  gender: Gender;
  url: string;
  thumb: string;
  format: ModelFormat;
  /**
   * False for models whose licence forbids redistribution: they work locally
   * but are kept out of the repository, so a fresh clone will not have them.
   */
  bundled: boolean;
  /** Shown in the UI when the licence requires credit. */
  author?: string;
  licenseUrl?: string;
}

/**
 * VRM 1.0 avatars bundled with the app, so the studio is usable without
 * sourcing a model first. Files live in public/avatars; thumbnails come from
 * each VRM's own metadata via scripts/extract-vrm-thumbnails.mjs.
 */
type Entry = Omit<AvatarPreset, "url" | "thumb" | "format" | "bundled"> &
  Partial<Pick<AvatarPreset, "bundled">>;

/**
 * pixiv's official VRM samples carry avatarPermission "onlyAuthor",
 * modification "prohibited" and allowRedistribution false, so they are marked
 * unbundled: usable on a machine that has the files, never committed.
 */
const PIXIV_SAMPLE = {
  bundled: false,
  author: "pixiv VRoid Project",
  licenseUrl: "https://vrm.dev/licenses/1.0/",
} as const;

const FILES: Entry[] = [
  { id: "01-female-cute", label: "큐트", gender: "female" },
  { id: "02-female-athletic", label: "스포티", gender: "female" },
  { id: "03-female-calm", label: "차분", gender: "female" },
  { id: "04-female-fantasy", label: "판타지", gender: "female" },
  { id: "sample-a", label: "내추럴", gender: "female", ...PIXIV_SAMPLE },
  { id: "sample-y", label: "스쿨", gender: "female", ...PIXIV_SAMPLE },
  { id: "05-male-cute", label: "큐트", gender: "male" },
  { id: "06-male-strong", label: "강인", gender: "male" },
  { id: "07-male-calm", label: "차분", gender: "male" },
  { id: "08-male-fantasy", label: "판타지", gender: "male" },
  { id: "sample-t", label: "실버", gender: "male", ...PIXIV_SAMPLE },
  { id: "sample-z", label: "캐주얼", gender: "male", ...PIXIV_SAMPLE },
];

export const AVATAR_PRESETS: AvatarPreset[] = FILES.map((f) => ({
  bundled: true,
  ...f,
  url: `/avatars/${f.id}.vrm`,
  thumb: `/avatars/thumbs/${f.id}.jpg`,
  format: "vrm" as const,
}));

/** Never default to a model that a fresh clone will not have. */
export const DEFAULT_PRESET = AVATAR_PRESETS.find((p) => p.bundled)!;

export const GENDER_LABEL: Record<Gender, string> = {
  female: "여성",
  male: "남성",
};

export function findPreset(id: string | null): AvatarPreset | null {
  if (!id) return null;
  return AVATAR_PRESETS.find((p) => p.id === id) ?? null;
}
