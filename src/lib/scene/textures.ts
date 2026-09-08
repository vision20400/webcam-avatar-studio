import * as THREE from "three";

/**
 * Canvas-generated textures for the scenic backdrops.
 *
 * Everything here is drawn at runtime rather than shipped as image files: the
 * repository is already heavy with avatars, and a photographic skyline would
 * drag licensing along with it.
 */

function surface(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext("2d")! };
}

export interface SkyStop {
  /** 0 = zenith, 0.5 = horizon, 1 = nadir. */
  at: number;
  color: string;
}

export interface SkyGlow {
  /** 0..1 around the horizon. Keep away from 0 and 1 to avoid the seam. */
  azimuth: number;
  /** 0 = horizon, 1 = zenith. */
  elevation: number;
  color: string;
  radius: number;
}

/**
 * Equirectangular sky. Mapped as a dome rather than a flat backdrop so the
 * horizon stays level with the geometry while the camera orbits.
 */
export function skyTexture(stops: SkyStop[], glows: SkyGlow[] = []) {
  const w = 1024;
  const h = 512;
  const { canvas, ctx } = surface(w, h);

  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  for (const stop of stops) gradient.addColorStop(stop.at, stop.color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = "lighter";
  for (const glow of glows) {
    const x = glow.azimuth * w;
    const y = (0.5 - glow.elevation * 0.5) * h;
    const radial = ctx.createRadialGradient(x, y, 0, x, y, glow.radius);
    radial.addColorStop(0, glow.color);
    radial.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = radial;
    ctx.fillRect(x - glow.radius, y - glow.radius, glow.radius * 2, glow.radius * 2);
  }
  ctx.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export interface WindowOptions {
  /** Colours picked at random for each lit window. */
  lit: string[];
  /** Fraction of windows with the lights on, 0..1. */
  density: number;
  columns?: number;
  rows?: number;
}

/**
 * Tiling window pattern used as an emissive map, so buildings read as occupied
 * rather than as grey blocks. Meant to be repeated per building.
 */
export function windowTexture({ lit, density, columns = 10, rows = 14 }: WindowOptions) {
  const w = 256;
  const h = 256;
  const { canvas, ctx } = surface(w, h);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);

  const cellW = w / columns;
  const cellH = h / rows;
  const padX = cellW * 0.3;
  const padY = cellH * 0.34;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      if (Math.random() > density) continue;
      ctx.fillStyle = lit[(Math.random() * lit.length) | 0];
      ctx.globalAlpha = 0.55 + Math.random() * 0.45;
      ctx.fillRect(
        col * cellW + padX / 2,
        row * cellH + padY / 2,
        cellW - padX,
        cellH - padY,
      );
    }
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Soft radial falloff for additive glow quads — cheap stand-in for bloom. */
export function glowTexture() {
  const size = 128;
  const { canvas, ctx } = surface(size, size);
  const radial = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2,
  );
  radial.addColorStop(0, "rgba(255,255,255,1)");
  radial.addColorStop(0.35, "rgba(255,255,255,0.42)");
  radial.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Emissive floor grid for the cyber scene. */
export function gridTexture(color: string, background = "#05060d") {
  const size = 128;
  const { canvas, ctx } = surface(size, size);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Horizontal light streaks, scrolled slowly to suggest moving water. */
export function waterStreakTexture(color: string) {
  const w = 512;
  const h = 512;
  const { canvas, ctx } = surface(w, h);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = color;
  for (let i = 0; i < 220; i++) {
    const y = Math.random() * h;
    const length = 12 + Math.random() * 90;
    ctx.globalAlpha = 0.05 + Math.random() * 0.3;
    ctx.fillRect(Math.random() * w, y, length, 1 + Math.random() * 2);
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
