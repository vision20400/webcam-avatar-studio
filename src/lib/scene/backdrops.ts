import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import {
  glowTexture,
  gridTexture,
  skyTexture,
  waterStreakTexture,
  windowTexture,
} from "./textures";

export type SceneBackdropId = "busan" | "cyber";

/**
 * Lighting that belongs with a backdrop. An avatar lit neutrally in front of a
 * neon skyline reads as a cut-out, so each scene retints the key and rim lights
 * rather than only swapping what is behind the character.
 */
export interface BackdropEnvironment {
  background: THREE.Texture;
  fog: { color: number; near: number; far: number } | null;
  hemi: { sky: number; ground: number; intensity: number };
  key: { color: number; intensity: number; position: [number, number, number] };
  rim: { color: number; intensity: number; position: [number, number, number] };
  exposure: number;
  /** Opacity of the shadow-catcher under the avatar. */
  shadowOpacity: number;
  environmentIntensity: number;
}

export interface Backdrop {
  root: THREE.Group;
  env: BackdropEnvironment;
  update(elapsed: number): void;
  dispose(): void;
}

export const BACKDROP_LABEL: Record<SceneBackdropId, string> = {
  busan: "부산",
  cyber: "사이버네틱",
};

/** Deterministic pseudo-random, so a scene looks the same on every reload. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface SkylineOptions {
  count: number;
  innerRadius: number;
  outerRadius: number;
  heightRange: [number, number];
  widthRange: [number, number];
  baseY: number;
  arc?: [number, number];
  /** World units covered by one tile of the window texture. */
  tile: number;
  seed: number;
}

/**
 * A ring of buildings merged into a single geometry. UVs are scaled per face so
 * windows keep a constant world size instead of stretching with the building.
 */
function buildSkyline(options: SkylineOptions): THREE.BufferGeometry {
  const rand = seeded(options.seed);
  const [arcStart, arcEnd] = options.arc ?? [0, Math.PI * 2];
  const parts: THREE.BufferGeometry[] = [];

  for (let i = 0; i < options.count; i++) {
    const angle = arcStart + rand() * (arcEnd - arcStart);
    const radius =
      options.innerRadius + rand() * (options.outerRadius - options.innerRadius);
    const width =
      options.widthRange[0] + rand() * (options.widthRange[1] - options.widthRange[0]);
    const depth = width * (0.7 + rand() * 0.7);
    const height =
      options.heightRange[0] + rand() * (options.heightRange[1] - options.heightRange[0]);

    const box = new THREE.BoxGeometry(width, height, depth);
    scaleBoxUVs(box, width, height, depth, options.tile);
    box.rotateY(rand() * Math.PI);
    box.translate(
      Math.cos(angle) * radius,
      options.baseY + height / 2,
      Math.sin(angle) * radius,
    );
    parts.push(box);
  }

  const merged = mergeGeometries(parts, false)!;
  for (const part of parts) part.dispose();
  return merged;
}

/**
 * BoxGeometry gives every face a 0..1 UV. Rescale per face group so one texture
 * tile always covers `tile` world units: +x/-x span depth x height, +y/-y span
 * width x depth, +z/-z span width x height.
 */
function scaleBoxUVs(
  box: THREE.BufferGeometry,
  width: number,
  height: number,
  depth: number,
  tile: number,
) {
  const uv = box.attributes.uv as THREE.BufferAttribute;
  const spans: [number, number][] = [
    [depth, height],
    [depth, height],
    [width, depth],
    [width, depth],
    [width, height],
    [width, height],
  ];
  for (let face = 0; face < 6; face++) {
    const [su, sv] = spans[face];
    for (let v = 0; v < 4; v++) {
      const index = face * 4 + v;
      uv.setXY(index, uv.getX(index) * (su / tile), uv.getY(index) * (sv / tile));
    }
  }
  uv.needsUpdate = true;
}

function disposeTree(root: THREE.Object3D, extra: { dispose(): void }[]) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = (mesh as THREE.Mesh).material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
  });
  for (const item of extra) item.dispose();
  root.removeFromParent();
}

// ---------------------------------------------------------------------------
// 부산 — 광안대교와 마린시티 야경
// ---------------------------------------------------------------------------

function createBusan(): Backdrop {
  const root = new THREE.Group();
  const textures: THREE.Texture[] = [];
  const glow = glowTexture();
  textures.push(glow);

  const sky = skyTexture(
    [
      { at: 0, color: "#0b1030" },
      { at: 0.34, color: "#243066" },
      { at: 0.48, color: "#7b4f86" },
      { at: 0.52, color: "#d4784f" },
      { at: 0.58, color: "#3a2440" },
      { at: 1, color: "#080a16" },
    ],
    [
      { azimuth: 0.5, elevation: 0.04, color: "rgba(255,168,96,0.55)", radius: 260 },
      { azimuth: 0.2, elevation: 0.1, color: "rgba(120,150,255,0.18)", radius: 200 },
    ],
  );
  textures.push(sky);

  // --- 바다 ---------------------------------------------------------------
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: 0x060b1a,
      roughness: 0.32,
      metalness: 0.55,
    }),
  );
  sea.position.y = -2.4;
  root.add(sea);

  const shimmerTexture = waterStreakTexture("#ffbe86");
  shimmerTexture.repeat.set(90, 90);
  textures.push(shimmerTexture);
  const shimmer = new THREE.Mesh(
    new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: shimmerTexture,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: 0.2,
    }),
  );
  shimmer.position.y = -2.35;
  root.add(shimmer);

  // --- 스카이라인 ---------------------------------------------------------
  const windows = windowTexture({
    lit: ["#ffd9a0", "#ffe9c8", "#9fc4ff", "#fff3d6"],
    density: 0.34,
  });
  textures.push(windows);

  const skyline = new THREE.Mesh(
    buildSkyline({
      // 마린시티 기준: 70~280m 높이의 건물이 0.9~2.4km 밖에 서 있는 거리감.
      count: 96,
      innerRadius: 1800,
      outerRadius: 3600,
      heightRange: [90, 320],
      widthRange: [40, 95],
      baseY: -2.4,
      tile: 26,
      seed: 20260908,
    }),
    new THREE.MeshStandardMaterial({
      color: 0x0d1226,
      roughness: 0.85,
      emissiveMap: windows,
      emissive: 0xffffff,
      emissiveIntensity: 1.05,
    }),
  );
  root.add(skyline);

  // --- 광안대교 -----------------------------------------------------------
  const bridge = new THREE.Group();
  bridge.position.set(0, 0, -1300);
  root.add(bridge);

  const steel = new THREE.MeshStandardMaterial({
    color: 0x1a2036,
    roughness: 0.7,
    metalness: 0.35,
  });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3600, 6, 30), steel);
  deck.position.y = 16;
  bridge.add(deck);

  for (const x of [-250, 250]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(11, 120, 11), steel);
    tower.position.set(x, 62, 0);
    bridge.add(tower);
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(11, 6, 34), steel);
    crossbar.position.set(x, 108, 0);
    bridge.add(crossbar);
  }

  const cableMaterial = new THREE.MeshStandardMaterial({
    color: 0xdfe6ff,
    emissive: 0x6f86c8,
    emissiveIntensity: 0.5,
    roughness: 0.4,
  });
  const cableSpans: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [
    [new THREE.Vector3(-250, 118, 0), new THREE.Vector3(0, 24, 0), new THREE.Vector3(250, 118, 0)],
    [new THREE.Vector3(-780, 46, 0), new THREE.Vector3(-515, 22, 0), new THREE.Vector3(-250, 118, 0)],
    [new THREE.Vector3(250, 118, 0), new THREE.Vector3(515, 22, 0), new THREE.Vector3(780, 46, 0)],
  ];
  for (const [a, b, c] of cableSpans) {
    for (const z of [-13, 13]) {
      const curve = new THREE.QuadraticBezierCurve3(
        a.clone().setZ(z),
        b.clone().setZ(z),
        c.clone().setZ(z),
      );
      bridge.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 1.1, 6, false), cableMaterial));
    }
  }

  // 다리 위 조명 — 개별 메시 대신 인스턴싱으로 한 번에 그립니다.
  const lampGeometry = new THREE.SphereGeometry(4, 8, 6);
  const lampMaterial = new THREE.MeshBasicMaterial({ color: 0xffd39b });
  const lampCount = 60;
  const lamps = new THREE.InstancedMesh(lampGeometry, lampMaterial, lampCount);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < lampCount; i++) {
    const x = -1700 + (3400 / (lampCount - 1)) * i;
    matrix.setPosition(x, 22, 0);
    lamps.setMatrixAt(i, matrix);
  }
  lamps.instanceMatrix.needsUpdate = true;
  bridge.add(lamps);

  const lampGlow = new THREE.Group();
  for (let i = 0; i < lampCount; i += 2) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glow,
        color: 0xffc175,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        opacity: 0.75,
      }),
    );
    sprite.position.set(-1700 + (3400 / (lampCount - 1)) * i, 22, 0);
    sprite.scale.setScalar(72);
    lampGlow.add(sprite);
  }
  bridge.add(lampGlow);

  // --- 아바타가 서 있는 테라스 --------------------------------------------
  const terrace = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 7.6, 2.6, 56),
    new THREE.MeshStandardMaterial({ color: 0x1d2231, roughness: 0.82, metalness: 0.18 }),
  );
  terrace.position.y = -1.32;
  terrace.receiveShadow = true;
  root.add(terrace);

  const rail = new THREE.Mesh(
    new THREE.TorusGeometry(7.05, 0.05, 8, 72).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x33507f }),
  );
  rail.position.y = 0.02;
  root.add(rail);

  return {
    root,
    env: {
      background: sky,
      fog: { color: 0x2c2442, near: 900, far: 6200 },
      hemi: { sky: 0x33407a, ground: 0x10101c, intensity: 1.0 },
      key: { color: 0xffc78a, intensity: 1.7, position: [2.2, 3.0, 2.6] },
      rim: { color: 0x6fa4ff, intensity: 1.7, position: [-2.6, 2.1, -2.4] },
      exposure: 1.05,
      shadowOpacity: 0.34,
      environmentIntensity: 0.5,
    },
    update(elapsed) {
      shimmerTexture.offset.y = elapsed * 0.006;
      shimmerTexture.offset.x = Math.sin(elapsed * 0.05) * 0.02;
    },
    dispose() {
      disposeTree(root, textures);
    },
  };
}

// ---------------------------------------------------------------------------
// 사이버네틱 — 네온 시티
// ---------------------------------------------------------------------------

function createCyber(): Backdrop {
  const root = new THREE.Group();
  const textures: THREE.Texture[] = [];
  const glow = glowTexture();
  textures.push(glow);

  const sky = skyTexture(
    [
      { at: 0, color: "#04030c" },
      { at: 0.3, color: "#160c34" },
      { at: 0.47, color: "#4a1264" },
      { at: 0.52, color: "#a31f6d" },
      { at: 0.6, color: "#160a24" },
      { at: 1, color: "#03030a" },
    ],
    [
      { azimuth: 0.5, elevation: 0.06, color: "rgba(255,64,190,0.42)", radius: 240 },
      { azimuth: 0.78, elevation: 0.14, color: "rgba(60,220,255,0.3)", radius: 210 },
    ],
  );
  textures.push(sky);

  // --- 바닥 그리드 ---------------------------------------------------------
  const grid = gridTexture("#2de3ff", "#0a0c1a");
  grid.repeat.set(900, 900);
  textures.push(grid);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: grid }),
  );
  floor.position.y = -0.02;
  root.add(floor);

  // --- 타워 두 무리: 시안 창 / 마젠타 창 -----------------------------------
  const cyanWindows = windowTexture({
    lit: ["#5ff0ff", "#b6f6ff", "#2bb8ff"],
    density: 0.2,
  });
  const magentaWindows = windowTexture({
    lit: ["#ff5fd2", "#ffb0ea", "#c94dff"],
    density: 0.17,
  });
  textures.push(cyanWindows, magentaWindows);

  const towerSets: [THREE.Texture, number, number][] = [
    [cyanWindows, 0x6ff2ff, 71001],
    [magentaWindows, 0xff62d6, 71002],
  ];
  for (const [map, emissive, seed] of towerSets) {
    const towers = new THREE.Mesh(
      buildSkyline({
        count: 52,
        innerRadius: 620,
        outerRadius: 2500,
        heightRange: [140, 520],
        widthRange: [60, 170],
        baseY: 0,
        tile: 24,
        seed,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x07070f,
        roughness: 0.55,
        metalness: 0.4,
        emissiveMap: map,
        emissive,
        emissiveIntensity: 1.15,
      }),
    );
    root.add(towers);
  }

  // --- 네온 사인 글로우 ----------------------------------------------------
  const signs: THREE.Sprite[] = [];
  const rand = seeded(4242);
  const signColors = [0x3ce7ff, 0xff45c8, 0x9a5cff, 0xffd23c];
  for (let i = 0; i < 26; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 550 + rand() * 1900;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glow,
        color: signColors[(rand() * signColors.length) | 0],
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        opacity: 0.55 + rand() * 0.4,
      }),
    );
    sprite.position.set(
      Math.cos(angle) * radius,
      60 + rand() * 430,
      Math.sin(angle) * radius,
    );
sprite.scale.setScalar(95 + rand() * 320);
    sprite.userData.phase = rand() * Math.PI * 2;
    sprite.userData.base = sprite.material.opacity;
    signs.push(sprite);
    root.add(sprite);
  }

  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(6.4, 6.4, 0.22, 56),
    new THREE.MeshStandardMaterial({
      color: 0x161b30,
      roughness: 0.3,
      metalness: 0.75,
    }),
  );
  pad.position.y = -0.11;
  pad.receiveShadow = true;
  root.add(pad);

  const padRing = new THREE.Mesh(
    new THREE.TorusGeometry(6.4, 0.07, 8, 80).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x3ce7ff }),
  );
  padRing.position.y = 0.01;
  root.add(padRing);

  return {
    root,
    env: {
      background: sky,
      fog: { color: 0x220d36, near: 500, far: 5200 },
      hemi: { sky: 0x3a1358, ground: 0x04050e, intensity: 0.85 },
      key: { color: 0x9fe8ff, intensity: 1.5, position: [2.0, 2.7, 2.3] },
      rim: { color: 0xff58cf, intensity: 2.2, position: [-2.3, 1.9, -2.5] },
      exposure: 1.1,
      shadowOpacity: 0.4,
      environmentIntensity: 0.45,
    },
    update(elapsed) {
      for (const sprite of signs) {
        const phase = sprite.userData.phase as number;
        const base = sprite.userData.base as number;
        sprite.material.opacity = base * (0.72 + 0.28 * Math.sin(elapsed * 1.6 + phase));
      }
      grid.offset.y = -elapsed * 0.02;
    },
    dispose() {
      disposeTree(root, textures);
    },
  };
}

export function createBackdrop(id: SceneBackdropId): Backdrop {
  return id === "busan" ? createBusan() : createCyber();
}
