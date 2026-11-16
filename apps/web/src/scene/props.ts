import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { freeze } from './bake.js';

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

/**
 * Glass that refracts what is behind it (`transmission`) makes the renderer draw the whole room a second time, every
 * frame it is in sight, for one clock face: plain see-through glass looks the same at this size and costs nothing.
 */
export function withoutTransmission<T extends THREE.Object3D>(root: T): T {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const glass = material as THREE.MeshPhysicalMaterial;
      if (!glass.isMeshPhysicalMaterial || !(glass.transmission > 0)) continue;
      glass.opacity = Math.min(glass.opacity, 1 - glass.transmission * 0.8);
      glass.transmission = 0;
      glass.transparent = true;
      glass.depthWrite = false;
      glass.needsUpdate = true;
    }
  });
  return root;
}

export function loadProp(name: string): Promise<THREE.Group> {
  let model = models.get(name);
  if (!model) {
    model = loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`).then((gltf) => withoutTransmission(gltf.scene));
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
      freeze(holder);
      appeared();
    })
    .catch(() => undefined);
}

/**
 * Many copies of one model (the chairs of a classroom, its desks): one instanced mesh per part of the model, so the
 * whole set costs a single draw call per material however many there are.
 */
export function placeMany(parent: THREE.Object3D, name: string, list: Placement[]): void {
  if (list.length === 0) return;
  if (list.length === 1 || list.some((at) => at.only)) {
    for (const at of list) placeProp(parent, name, at);
    return;
  }
  void loadProp(name)
    .then((model) => {
      model.updateMatrixWorld(true);
      const holder = new THREE.Group();
      holder.userData.dynamic = true;
      const place = new THREE.Matrix4();
      const turn = new THREE.Euler();
      const scale = new THREE.Vector3();
      const where = new THREE.Vector3();
      const q = new THREE.Quaternion();
      model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const many = new THREE.InstancedMesh(mesh.geometry, mesh.material, list.length);
        list.forEach((at, i) => {
          turn.set(at.tiltX ?? 0, at.turn ?? 0, at.tiltZ ?? 0);
          place.compose(where.set(at.x, at.y, at.z), q.setFromEuler(turn), scale.setScalar(at.scale ?? 1));
          many.setMatrixAt(i, place.clone().multiply(mesh.matrixWorld));
        });
        many.castShadow = true;
        many.receiveShadow = true;
        many.computeBoundingSphere();
        holder.add(many);
      });
      parent.add(holder);
      appeared();
    })
    .catch(() => undefined);
}

/** A list of models to place, grouped by model so that repeated ones are instanced. */
export function placeAll(parent: THREE.Object3D, props: { name: string; at: Placement }[]): void {
  const byName = new Map<string, Placement[]>();
  for (const p of props) byName.set(p.name, [...(byName.get(p.name) ?? []), p.at]);
  for (const [name, list] of byName) placeMany(parent, name, list);
}
