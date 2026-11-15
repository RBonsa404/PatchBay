import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { signature } from '../src/scene/bake.js';

const dir = fileURLToPath(new URL('../src/assets/lightmaps/', import.meta.url));
const manifest = JSON.parse(readFileSync(`${dir}manifest.json`, 'utf8')) as {
  intensity: number;
  parts: Record<string, { image: string; coords: string; scale: number; meshes: { name: string; signature: string; offset: number; count: number }[] }>;
};

describe('baked light', () => {
  it('covers every part of the building', () => {
    expect(Object.keys(manifest.parts).sort()).toEqual(['part-lab', 'part-lower', 'part-office', 'part-stairs', 'part-upper', 'technical-room']);
    expect(manifest.intensity).toBeGreaterThan(0);
  });

  it('has the coordinates of every vertex, in order, and a picture for each part', () => {
    for (const [part, entry] of Object.entries(manifest.parts)) {
      let offset = 0;
      for (const mesh of entry.meshes) {
        expect(mesh.name.startsWith(`${part}#`)).toBe(true);
        expect(mesh.offset).toBe(offset);
        expect(mesh.signature).toMatch(new RegExp(`^${mesh.count}-[0-9a-f]+$`));
        offset += mesh.count;
      }
      expect(statSync(`${dir}${entry.coords}`).size).toBe(offset * 2 * 2);
      expect(statSync(`${dir}${entry.image}`).size).toBeGreaterThan(1000);
      expect(entry.scale).toBeGreaterThan(0);
    }
  });

  it('fingerprints geometry so that any change of the room is noticed', () => {
    const a = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    const b = a.clone();
    expect(signature(a)).toBe(signature(b));
    b.translate(0, 0.002, 0);
    expect(signature(a)).not.toBe(signature(b));
    expect(signature(a).startsWith('36-')).toBe(true);
  });
});
