import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * The people of the buildings: the student the player walks as, and the colleagues at their desks, at the reception,
 * in the lounge. Each is a skinned model (`public/models/people/<name>.glb`, built in Blender by `tools/people.cjs`)
 * animated with the shared clips of `anims.glb`: idle, walking, sitting, talking, kneeling to work, reaching out.
 */

const loader = new GLTFLoader();
const base = (): string => `${import.meta.env.BASE_URL}models/people/`;
let clips: Promise<{ list: THREE.AnimationClip[]; hips: number }> | null = null;
const models = new Map<string, Promise<THREE.Group>>();

export type Motion =
  | 'Idle_Loop'
  | 'Idle_Talking_Loop'
  | 'Walk_Loop'
  | 'Walk_Formal_Loop'
  | 'Jog_Fwd_Loop'
  | 'Crouch_Idle_Loop'
  | 'Fixing_Kneeling'
  | 'Interact'
  | 'PickUp_Table'
  | 'Sitting_Idle_Loop'
  | 'Sitting_Talking_Loop';

/** The shared clips, and the height of the hips of the person they were made on. */
function animations(): Promise<{ list: THREE.AnimationClip[]; hips: number }> {
  clips ??= loader.loadAsync(`${base()}anims.glb`).then((g) => ({
    list: g.animations,
    hips: g.scene.getObjectByName('pelvis')?.position.length() ?? 1,
  }));
  return clips;
}

/** The clips for someone taller or shorter: the hips move by as much, in proportion (the rest are turns, shared). */
function fitted(list: THREE.AnimationClip[], scale: number): THREE.AnimationClip[] {
  if (Math.abs(scale - 1) < 0.01) return list;
  return list.map((clip) => {
    const c = clip.clone();
    for (const t of c.tracks) {
      if (t.name === 'pelvis.position') for (let i = 0; i < t.values.length; i++) t.values[i] = (t.values[i] as number) * scale;
    }
    return c;
  });
}

function model(name: string): Promise<THREE.Group> {
  let m = models.get(name);
  if (!m) {
    m = loader.loadAsync(`${base()}${name}.glb`).then((g) => g.scene);
    models.set(name, m);
  }
  return m;
}

/** Turn added to a model so that it faces +z (the way the game's yaw 0 looks). */
const FACING = 0;

export class Person {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private wanted: Motion = 'Idle_Loop';
  private oneShot = false;
  readonly ready: Promise<boolean>;

  constructor(readonly name: string) {
    this.root.name = `person-${name}`;
    this.root.userData.dynamic = true;
    this.ready = Promise.all([model(name), animations()])
      .then(([m, anims]) => {
        const body = clone(m);
        const hips = body.getObjectByName('pelvis')?.position.length() ?? anims.hips;
        const list = fitted(anims.list, hips / anims.hips);
        body.rotation.y = FACING;
        body.traverse((o) => {
          const mesh = o as THREE.SkinnedMesh;
          if (!mesh.isMesh) return;
          // Eyes, brows and lashes are too small to cast a shadow worth a pass of their own.
          const tiny = /eye|brow|lash|low-poly/i.test(mesh.name);
          mesh.castShadow = !tiny;
          mesh.receiveShadow = !tiny;
          // Skinned meshes move away from their bind pose: never let the frustum test hide a person by mistake.
          mesh.frustumCulled = false;
          // Hair, brows and lashes are cut out of their pictures: a hard edge sorts right, a blended one would not.
          for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            const std = mat as THREE.MeshStandardMaterial;
            if (std.transparent || std.alphaTest > 0) {
              std.transparent = false;
              std.alphaTest = 0.45;
              std.depthWrite = true;
              std.alphaToCoverage = true;
            }
          }
        });
        this.root.add(body);
        this.mixer = new THREE.AnimationMixer(body);
        for (const clip of list) this.actions.set(clip.name, this.mixer.clipAction(clip));
        this.mixer.addEventListener('finished', () => {
          this.oneShot = false;
          this.play(this.wanted, 0.3);
        });
        this.play(this.wanted, 0);
        return true;
      })
      .catch((e: unknown) => {
        console.warn(`person ${name}`, e);
        return false;
      });
  }

  /** Change to a looping motion, blending from the one before over `fade` seconds. */
  play(motion: Motion, fade = 0.25): void {
    this.wanted = motion;
    if (this.oneShot) return;
    const next = this.actions.get(motion);
    if (!next || next === this.current) return;
    next.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(fade).play();
    this.current?.fadeOut(fade);
    this.current = next;
  }

  /** A gesture played once (reaching to a port, kneeling to a low one), then back to what the person was doing. */
  gesture(motion: Motion, fade = 0.15): void {
    const next = this.actions.get(motion);
    if (!next) return;
    this.oneShot = true;
    next.reset().setLoop(THREE.LoopOnce, 1).fadeIn(fade).play();
    next.clampWhenFinished = false;
    this.current?.fadeOut(fade);
    this.current = next;
  }

  private owed = 0;

  /** Move on by `dt`; `rate` frames a second at most (people far away need fewer to look alive). */
  update(dt: number, rate = 0): void {
    if (!rate) {
      this.mixer?.update(dt + this.owed);
      this.owed = 0;
      return;
    }
    this.owed += dt;
    if (this.owed < 1 / rate) return;
    this.mixer?.update(this.owed);
    this.owed = 0;
  }

  get motion(): Motion {
    return this.wanted;
  }
}
