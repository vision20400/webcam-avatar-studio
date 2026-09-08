"use client";

import { create } from "zustand";

import type { BackgroundKind, CameraPreset } from "@/lib/scene/viewer";
import { DEFAULT_MANNEQUIN, type MannequinOptions } from "@/lib/avatar/mannequin";
import type { ModelFormat } from "@/lib/avatar/format";
import type { AvatarKind, PoseQuality, TrackMode } from "@/lib/types";

export interface Settings {
  mode: TrackMode;
  quality: PoseQuality;
  hands: boolean;
  mirror: boolean;

  avatarKind: AvatarKind;
  modelUrl: string | null;
  modelName: string | null;
  modelFormat: ModelFormat | null;
  mannequin: MannequinOptions;

  smoothing: number;
  followBody: number;
  headGain: number;
  expressionGain: number;

  background: BackgroundKind;
  chroma: string;
  cameraPreset: CameraPreset;

  showSkeleton: boolean;
  showCamera: boolean;
}

interface Store extends Settings {
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
  patch(next: Partial<Settings>): void;
}

const initial: Settings = {
  mode: "full",
  quality: "lite",
  hands: false,
  mirror: true,

  avatarKind: "mannequin",
  modelUrl: null,
  modelName: null,
  modelFormat: null,
  mannequin: DEFAULT_MANNEQUIN,

  smoothing: 0.45,
  followBody: 0.5,
  headGain: 1.15,
  expressionGain: 1.15,

  background: "gradient",
  chroma: "#00b140",
  cameraPreset: "full",

  showSkeleton: true,
  showCamera: true,
};

export const useSettings = create<Store>((set) => ({
  ...initial,
  set: (key, value) => set({ [key]: value } as Partial<Settings>),
  patch: (next) => set(next),
}));

/** Camera preset that suits a tracking mode, used when the mode changes. */
export function presetForMode(mode: TrackMode): CameraPreset {
  return mode === "face" ? "face" : "full";
}
