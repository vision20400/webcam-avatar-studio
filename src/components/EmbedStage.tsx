"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

import { useSettings } from "@/lib/store";
import { detectModelFormat } from "@/lib/avatar/format";
import { findPreset } from "@/lib/avatar/presets";
import type { BackgroundKind, CameraPreset } from "@/lib/scene/viewer";
import type { TrackMode } from "@/lib/types";
import { useAvatarEngine } from "./useAvatarEngine";

/**
 * Chrome-free avatar surface for OBS / Zoom browser sources.
 * Everything is configured through the query string so the window can be
 * pointed at, captured and forgotten.
 */
export function EmbedStage() {
  const params = useSearchParams();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const bg = (params.get("bg") as BackgroundKind) ?? "transparent";
    // `vrm` is the older spelling of `model`; both still work.
    const preset = findPreset(params.get("preset"));
    const modelUrl = preset?.url ?? params.get("model") ?? params.get("vrm");
    useSettings.getState().patch({
      mode: (params.get("mode") as TrackMode) ?? "full",
      mirror: params.get("mirror") !== "0",
      hands: params.get("hands") === "1",
      cameraPreset: (params.get("preset") as CameraPreset) ?? "full",
      background: bg,
      chroma: params.get("chroma") ?? "#00b140",
      showCamera: false,
      showSkeleton: false,
      ...(modelUrl
        ? {
            avatarKind: "model" as const,
            modelUrl,
            modelName: preset?.label ?? modelUrl.split("/").pop() ?? "내 아바타",
            modelFormat: preset?.format ?? detectModelFormat(modelUrl),
            presetId: preset?.id ?? null,
          }
        : {}),
    });
    document.body.classList.toggle("transparent-stage", bg === "transparent");
  }, [params]);

  const engine = useAvatarEngine({ canvasRef, videoRef, autoStart: true });

  return (
    <div className="fixed inset-0">
      <canvas ref={canvasRef} className="block h-full w-full" />
      <video ref={videoRef} playsInline muted className="hidden" />
      {engine.error ? (
        <p className="absolute inset-x-0 bottom-2 text-center text-[11px] text-rose-300">
          {engine.error}
        </p>
      ) : null}
    </div>
  );
}
