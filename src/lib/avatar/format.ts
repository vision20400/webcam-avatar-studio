/** Avatar file formats the app can rig. Kept free of three.js imports. */
export type ModelFormat = "vrm" | "glb" | "fbx";

export const MODEL_ACCEPT = ".vrm,.glb,.gltf,.fbx";

/**
 * Blob URLs carry no extension, so the original file name is the reliable
 * source — pass it whenever the model came from a file picker.
 */
export function detectModelFormat(nameOrUrl: string): ModelFormat | null {
  const path = nameOrUrl.toLowerCase().split(/[?#]/)[0];
  if (path.endsWith(".vrm")) return "vrm";
  if (path.endsWith(".fbx")) return "fbx";
  if (path.endsWith(".glb") || path.endsWith(".gltf")) return "glb";
  return null;
}

export const FORMAT_LABEL: Record<ModelFormat, string> = {
  vrm: "VRM",
  glb: "glTF",
  fbx: "FBX",
};
