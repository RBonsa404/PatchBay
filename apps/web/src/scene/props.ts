import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Objects modelled by artists (Poly Haven, CC0: see ASSETS.md), for what the player sees close up in the room. They
 * load in the background: until then, or if a file cannot be fetched, the room simply goes without them.
 */

const loader = new GLTFLoader();
const models = new Map<string, Promise<THREE.Group>>();

/** Called when a model has just appeared, for the static shadows to be drawn again. */
let appeared: () => void = () => undefined;
export function onPropAppeared(fn: () => void): void {
  appeared = fn;
}

export function loadProp(name: string): Promise<THREE.Group> {
  let model = models.get(name);
  if (!model) {
    model = loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`).then((gltf) => gltf.scene);
    models.set(name, model);
  }
  return model;
}

export interface Placement {
  x: number;
  y: number;
  z: number;
  /** Turn around the vertical axis, in radians. */
  turn?: number;
  scale?: number;
  /** For a file holding several variants: the names of the parts to use. */
  only?: string[];
  /** Lay it down or lean it: extra turns around x and z. */
  tiltX?: number;
  tiltZ?: number;
}

/** Add a copy of a model under `parent`, once it has loaded. */
export function placeProp(parent: THREE.Object3D, name: string, at: Placement): void {
  void loadProp(name)
    .then((model) => {
      const copy = new THREE.Group();
      if (at.only) {
        for (const name of at.only) {
          const part = model.getObjectByName(name)?.clone(true);
          if (!part) continue;
          part.position.setX(0).setZ(0);
          copy.add(part);
        }
      } else {
        copy.add(model.clone(true));
      }
      const holder = new THREE.Group();
      holder.position.set(at.x, at.y, at.z);
      holder.rotation.set(at.tiltX ?? 0, at.turn ?? 0, at.tiltZ ?? 0);
      holder.scale.setScalar(at.scale ?? 1);
      holder.add(copy);
      copy.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      parent.add(holder);
      appeared();
    })
    .catch(() => undefined);
}
