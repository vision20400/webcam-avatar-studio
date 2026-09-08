"use client";

import { useRef, useState } from "react";

import { useSettings, presetForMode, selectPreset } from "@/lib/store";
import {
  AVATAR_PRESETS,
  DEFAULT_PRESET,
  GENDER_LABEL,
  type Gender,
} from "@/lib/avatar/presets";
import {
  FORMAT_LABEL,
  MODEL_ACCEPT,
  detectModelFormat,
} from "@/lib/avatar/format";
import { DEFAULT_MANNEQUIN } from "@/lib/avatar/mannequin";
import type { useAvatarEngine } from "./useAvatarEngine";
import { Button, ColorField, OptionGrid, Panel, Segmented, Slider, Toggle } from "./ui";

type Engine = ReturnType<typeof useAvatarEngine>;

const PRESETS = [
  { name: "코발트", body: "#6d7dff", accent: "#151a2e", skin: "#ffd9c0" },
  { name: "민트", body: "#3ddc97", accent: "#0f2b25", skin: "#ffe0cc" },
  { name: "선셋", body: "#ff8a6b", accent: "#2b1220", skin: "#ffd2b3" },
  { name: "모노", body: "#c9ccd8", accent: "#1a1c22", skin: "#f0dccd" },
];

export function ControlPanel({ engine }: { engine: Engine }) {
  const s = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const objectUrl = useRef<string | null>(null);
  const [modelInput, setModelInput] = useState("");

  const source: "preset" | "custom" | "mannequin" =
    s.avatarKind === "mannequin" ? "mannequin" : s.presetId ? "preset" : "custom";

  const applyModelFile = (file: File) => {
    // Blob URLs carry no extension, so the format is read off the file name
    // here and kept in state for the loader to dispatch on.
    const format = detectModelFormat(file.name);
    if (!format) {
      engine.setError(
        `${file.name} 은(는) 지원하지 않는 형식입니다. .vrm, .glb, .gltf, .fbx 를 사용하세요.`,
      );
      return;
    }
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    const url = URL.createObjectURL(file);
    objectUrl.current = url;
    engine.setError(null);
    s.patch({
      avatarKind: "model",
      modelUrl: url,
      modelName: file.name.replace(/\.[^.]+$/, ""),
      modelFormat: format,
      presetId: null,
    });
  };

  const applyModelUrl = (raw: string) => {
    const url = raw.trim();
    const format = detectModelFormat(url);
    if (!format) {
      engine.setError(
        "주소가 .vrm / .glb / .gltf / .fbx 로 끝나야 형식을 알 수 있습니다.",
      );
      return;
    }
    engine.setError(null);
    s.patch({
      avatarKind: "model",
      modelUrl: url,
      modelName: url.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "내 아바타",
      modelFormat: format,
      presetId: null,
    });
  };

  return (
    <div className="space-y-3">
      <Panel title="트래킹" hint="전신은 몸 전체가 화면에 들어와야 안정적입니다.">
        <Segmented
          value={s.mode}
          onChange={(mode) =>
            s.patch({ mode, cameraPreset: presetForMode(mode) })
          }
          options={[
            { value: "full", label: "전신" },
            { value: "face", label: "얼굴만" },
          ]}
        />
        <Toggle
          label="거울 모드"
          hint="내가 든 손이 화면에서도 같은 쪽에 보입니다"
          checked={s.mirror}
          onChange={(v) => s.set("mirror", v)}
        />
        <Toggle
          label="손가락 트래킹"
          hint="정확도가 올라가지만 무거워집니다"
          checked={s.hands}
          onChange={(v) => s.set("hands", v)}
          disabled={s.mode !== "full"}
        />
        <div>
          <p className="mb-1 text-[12px] text-white/80">포즈 모델 정확도</p>
          <Segmented
            value={s.quality}
            onChange={(quality) => s.set("quality", quality)}
            options={[
              { value: "lite", label: "가볍게" },
              { value: "full", label: "정밀하게" },
            ]}
          />
        </div>
        <Slider
          label="부드러움"
          value={s.smoothing}
          onChange={(v) => s.set("smoothing", v)}
          format={(v) => `${Math.round(v * 100)}%`}
        />
        <Slider
          label="몸 따라가기"
          value={s.followBody}
          onChange={(v) => s.set("followBody", v)}
          format={(v) => `${Math.round(v * 100)}%`}
        />
        <Slider
          label="고개 반응"
          value={s.headGain}
          min={0.5}
          max={2}
          onChange={(v) => s.set("headGain", v)}
          format={(v) => `${v.toFixed(2)}x`}
        />
        <Slider
          label="표정 반응"
          value={s.expressionGain}
          min={0.5}
          max={2.5}
          onChange={(v) => s.set("expressionGain", v)}
          format={(v) => `${v.toFixed(2)}x`}
        />
      </Panel>

      <Panel
        title="아바타"
        hint="VRM 이 가장 정확합니다. glb·gltf·fbx 는 본 이름으로 자동 인식합니다."
      >
        <Segmented
          value={source}
          onChange={(next) => {
            if (next === "mannequin") {
              s.set("avatarKind", "mannequin");
            } else if (next === "preset") {
              s.patch(selectPreset(DEFAULT_PRESET));
            } else if (s.presetId || !s.modelUrl) {
              fileRef.current?.click();
            } else {
              s.set("avatarKind", "model");
            }
          }}
          options={[
            { value: "preset", label: "기본 아바타" },
            { value: "custom", label: "내 파일" },
            { value: "mannequin", label: "도형" },
          ]}
        />

        {source === "preset" ? (
          <div className="space-y-2.5">
            {(["female", "male"] as Gender[]).map((gender) => (
              <div key={gender}>
                <p className="mb-1 text-[11px] text-white/40">
                  {GENDER_LABEL[gender]}
                </p>
                <div className="grid grid-cols-4 gap-1.5">
                  {AVATAR_PRESETS.filter((p) => p.gender === gender).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      title={p.label}
                      onClick={() => s.patch(selectPreset(p))}
                      className={`overflow-hidden rounded-lg border transition ${
                        s.presetId === p.id
                          ? "border-indigo-400 ring-1 ring-indigo-400/60"
                          : "border-white/10 hover:border-white/30"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.thumb}
                        alt={`${GENDER_LABEL[p.gender]} ${p.label}`}
                        className="aspect-square w-full object-cover"
                        loading="lazy"
                      />
                      <span className="block truncate bg-black/40 px-1 py-0.5 text-[10px] text-white/70">
                        {p.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {s.avatarKind === "mannequin" ? (
          <>
            <div className="flex gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() =>
                    s.set("mannequin", {
                      body: p.body,
                      accent: p.accent,
                      skin: p.skin,
                    })
                  }
                  title={p.name}
                  className="h-7 flex-1 rounded-lg border border-white/10"
                  style={{
                    background: `linear-gradient(135deg, ${p.body} 0 50%, ${p.accent} 50% 100%)`,
                  }}
                />
              ))}
            </div>
            <ColorField
              label="옷 색"
              value={s.mannequin.body}
              onChange={(v) => s.set("mannequin", { ...s.mannequin, body: v })}
            />
            <ColorField
              label="포인트 색"
              value={s.mannequin.accent}
              onChange={(v) => s.set("mannequin", { ...s.mannequin, accent: v })}
            />
            <ColorField
              label="피부 색"
              value={s.mannequin.skin}
              onChange={(v) => s.set("mannequin", { ...s.mannequin, skin: v })}
            />
            <Button full onClick={() => s.set("mannequin", DEFAULT_MANNEQUIN)}>
              색상 초기화
            </Button>
          </>
        ) : source === "custom" ? (
          <p className="rounded-lg bg-black/25 px-3 py-2 text-[11px] text-white/50">
            현재 아바타: {s.modelName ?? "없음"}
            {s.modelFormat ? ` · ${FORMAT_LABEL[s.modelFormat]}` : ""}
          </p>
        ) : null}

        <input
          ref={fileRef}
          type="file"
          accept={MODEL_ACCEPT}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) applyModelFile(f);
            e.target.value = "";
          }}
        />
        {source === "custom" ? (
          <Button full onClick={() => fileRef.current?.click()}>
            모델 파일 올리기 (.vrm .glb .gltf .fbx)…
          </Button>
        ) : null}
        {source === "custom" ? (
        <div className="flex gap-1.5">
          <input
            value={modelInput}
            onChange={(e) => setModelInput(e.target.value)}
            placeholder="또는 모델 주소 붙여넣기"
            className="min-w-0 flex-1 rounded-xl bg-black/30 px-3 py-2 text-[12px] text-white/80 outline-none placeholder:text-white/25 focus:ring-1 focus:ring-indigo-400"
          />
          <Button
            disabled={!modelInput.trim()}
            onClick={() => applyModelUrl(modelInput)}
          >
            적용
          </Button>
        </div>
        ) : null}
      </Panel>

      <Panel title="화면">
        <div>
          <p className="mb-1 text-[12px] text-white/80">카메라 앵글</p>
          <Segmented
            value={s.cameraPreset}
            onChange={(v) => s.set("cameraPreset", v)}
            options={[
              { value: "full", label: "전신" },
              { value: "upper", label: "상반신" },
              { value: "face", label: "얼굴" },
            ]}
          />
        </div>
        <div>
          <p className="mb-1 text-[12px] text-white/80">배경</p>
          <OptionGrid
            value={s.background}
            onChange={(v) => s.set("background", v)}
            options={[
              { value: "busan", label: "부산", hint: "광안대교와 마린시티 야경" },
              { value: "cyber", label: "사이버네틱", hint: "네온 시티" },
              { value: "gradient", label: "다크" },
              { value: "studio", label: "스튜디오" },
              { value: "chroma", label: "크로마", hint: "크로마키 합성용 단색" },
              { value: "transparent", label: "투명", hint: "OBS 브라우저 소스용" },
            ]}
          />
        </div>
        {s.background === "chroma" ? (
          <ColorField
            label="크로마 색"
            value={s.chroma}
            onChange={(v) => s.set("chroma", v)}
          />
        ) : null}
        <Toggle
          label="웹캠 미리보기"
          checked={s.showCamera}
          onChange={(v) => s.set("showCamera", v)}
        />
        <Toggle
          label="스켈레톤 표시"
          checked={s.showSkeleton}
          onChange={(v) => s.set("showSkeleton", v)}
          disabled={!s.showCamera}
        />
      </Panel>

      <Panel title="내보내기" hint="OBS·Zoom에는 브라우저 소스로 /embed 주소를 넣으세요.">
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={engine.snapshot} disabled={!engine.ready}>
            PNG 저장
          </Button>
          <Button
            onClick={engine.toggleRecording}
            variant={engine.recording ? "danger" : "default"}
            disabled={!engine.ready}
          >
            {engine.recording ? "녹화 중지" : "webm 녹화"}
          </Button>
        </div>
        <Button
          full
          onClick={() => {
            const q = new URLSearchParams({
              mode: s.mode,
              mirror: s.mirror ? "1" : "0",
              hands: s.hands ? "1" : "0",
              camera: s.cameraPreset,
              bg: "transparent",
            });
            // Blob URLs from a local file pick can't cross window boundaries.
            if (s.presetId) {
              q.set("avatar", s.presetId);
            } else if (s.avatarKind === "model" && s.modelUrl?.startsWith("http")) {
              // Blob URLs from the file picker cannot cross window boundaries.
              q.set("model", s.modelUrl);
            }
            window.open(`/embed?${q}`, "avatar-embed", "width=720,height=960");
          }}
        >
          투명 배경 팝아웃 열기
        </Button>
      </Panel>
    </div>
  );
}
