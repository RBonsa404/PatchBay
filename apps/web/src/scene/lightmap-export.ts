import * as THREE from 'three';
import { LIGHTMAPPED_PARTS } from './lightmaps.js';

/**
 * Development only: what Blender needs to bake the light of the building (`tools/bake/`). For every still part of the
 * building, its merged meshes as they are in the game, each with its role in the bake: a surface that receives the
 * light, a ceiling panel or window that gives it, or an object that only casts shadows. The light Blender computes is
 * then brought back as textures on exactly these meshes, which is why each carries the signature of its vertices.
 */

interface ExportedMesh {
  name: string;
  part: string;
  signature: string;
  role: 'target' | 'panel' | 'window' | 'occluder';
  /** Linear colour of the surface, its texture averaged: what the light takes from it when it bounces. */
  albedo: [number, number, number];
  matrix: number[];
  position: string;
  normal: string;
}

const base64 = (array: Float32Array): string => {
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

const averages = new WeakMap<object, THREE.Color>();

/** The mean colour of a texture, in linear values. */
function mean(texture: THREE.Texture | null): THREE.Color {
  const white = new THREE.Color(1, 1, 1);
  const image = texture?.image as CanvasImageSource | undefined;
  if (!texture || !image) return white;
  const known = averages.get(image);
  if (known) return known;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    ctx.drawImage(image, 0, 0, 32, 32);
    const data = ctx.getImageData(0, 0, 32, 32).data;
    const sum = [0, 0, 0];
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) sum[c]! += THREE.SRGBToLinear((data[i + c] as number) / 255);
    }
    const n = data.length / 4;
    const colour = new THREE.Color(sum[0]! / n, sum[1]! / n, sum[2]! / n);
    averages.set(image, colour);
    return colour;
  } catch {
    return white;
  }
}

function role(material: THREE.Material): ExportedMesh['role'] | null {
  if (material.transparent || material.opacity < 1) return null;
  const basic = material as THREE.MeshBasicMaterial;
  if (basic.isMeshBasicMaterial) {
    const l = basic.color.r * 0.2126 + basic.color.g * 0.7152 + basic.color.b * 0.0722;
    if (!basic.toneMapped && !basic.map && l > 0.8) return 'panel';
    if (basic.map && l > 0.4) return 'window';
    return 'occluder';
  }
  return (material as THREE.MeshStandardMaterial).isMeshStandardMaterial ? 'target' : 'occluder';
}

export function exportStatic(scene: THREE.Scene): { meshes: ExportedMesh[]; lights: { position: number[]; color: number[]; intensity: number; distance: number }[] } {
  scene.updateMatrixWorld(true);
  const meshes: ExportedMesh[] = [];
  for (const part of LIGHTMAPPED_PARTS) {
    const group = scene.getObjectByName(part);
    if (!group) continue;
    for (const child of group.children) {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || typeof mesh.userData.signature !== 'string' || Array.isArray(mesh.material)) continue;
      const material = mesh.material;
      const kind = role(material);
      if (!kind) continue;
      const m = material as THREE.MeshStandardMaterial;
      const colour = (m.color ?? new THREE.Color(1, 1, 1)).clone().multiply(mean(m.map ?? null));
      if (kind === 'target') colour.multiplyScalar(1 - 0.6 * (m.metalness ?? 0));
      mesh.geometry.computeBoundingBox();
      meshes.push({
        name: mesh.name,
        part,
        signature: mesh.userData.signature as string,
        role: kind,
        albedo: [colour.r, colour.g, colour.b],
        matrix: mesh.matrixWorld.toArray(),
        position: base64((mesh.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array),
        normal: base64((mesh.geometry.attributes.normal as THREE.BufferAttribute).array as Float32Array),
      });
    }
  }
  const lights: { position: number[]; color: number[]; intensity: number; distance: number }[] = [];
  scene.traverse((o) => {
    const light = o as THREE.PointLight;
    if (light.isPointLight && light.userData.baked) {
      lights.push({ position: light.getWorldPosition(new THREE.Vector3()).toArray(), color: light.color.toArray(), intensity: light.intensity, distance: light.distance });
    }
  });
  return { meshes, lights };
}
