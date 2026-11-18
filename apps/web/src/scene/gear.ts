import type * as THREE from 'three';
import { loadProp } from './props.js';

/**
 * The network equipment modelled in Blender (`art/blender/`), loaded once before the first room is built. Each model
 * carries empties named `port:<interface>` and `led:<interface>`, so the game knows where every socket and LED is
 * without measuring anything itself. A model that cannot be loaded leaves the device to its built-in shape.
 */

const GEAR = ['switch-2960', 'router-2911', 'router-1841', 'patch-panel-24', 'workstation', 'ntu', 'bench-pc', 'laptop'] as const;
export type GearName = (typeof GEAR)[number];

const loaded = new Map<GearName, THREE.Object3D>();

export async function loadGear(): Promise<void> {
  await Promise.all(
    GEAR.map(async (name) => {
      try {
        loaded.set(name, await loadProp(`gear/${name}`));
      } catch {
        // offline on a first visit, say: the device keeps its built-in shape
      }
    }),
  );
}

export function gearModel(name: GearName): THREE.Object3D | null {
  return loaded.get(name) ?? null;
}
