import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export type Quality = 'low' | 'medium' | 'high';

const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** A guess good enough to start with; the player can change it from the HUD. */
export function detectQuality(): Quality {
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  if (cores <= 2 || memory <= 2) return 'low';
  if (cores <= 4 || memory <= 4) return 'medium';
  return 'high';
}

/**
 * Renderer, camera, lights and post-processing. Physically based lighting with ACES tone mapping, soft shadows, a
 * reflection environment built on the fly (no download), and bloom so that LEDs and screens glow.
 */
export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  /** Everything belonging to the current level; cleared between levels. */
  readonly level = new THREE.Group();

  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly key: THREE.SpotLight;
  private readonly clock = new THREE.Clock();
  private readonly frameHandlers = new Set<(dt: number, time: number) => void>();
  private quality: Quality;

  constructor(private readonly container: HTMLElement, quality: Quality) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.02, 60);
    this.camera.position.set(0, 1.62, 2.15);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.92, -0.1);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.35;
    this.controls.maxDistance = 5;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.screenSpacePanning = true;

    this.scene.background = new THREE.Color('#070d1e');
    this.scene.fog = new THREE.FogExp2('#070d1e', 0.09);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();

    // Night-blue ambience from the charter, a warm key light over the bench, a cyan rim from behind.
    this.scene.add(new THREE.HemisphereLight('#9ec5ff', '#0b1e3f', 0.45));
    this.key = new THREE.SpotLight('#fff1dd', 24, 0, 0.62, 0.6, 2);
    this.key.position.set(0.4, 3.1, 1.3);
    this.key.target.position.set(0, 0.8, -0.2);
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    this.scene.add(this.key, this.key.target);
    const rim = new THREE.DirectionalLight('#38bdf8', 0.9);
    rim.position.set(-2, 2.2, -3);
    const fill = new THREE.DirectionalLight('#c7d8ff', 0.35);
    fill.position.set(2.5, 1.5, 2.5);
    this.scene.add(rim, fill, this.level);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.45, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.setQuality(quality);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  get currentQuality(): Quality {
    return this.quality;
  }

  setQuality(q: Quality): void {
    this.quality = q;
    this.renderer.setPixelRatio(q === 'low' ? 1 : Math.min(window.devicePixelRatio, q === 'high' ? 2 : 1.5));
    this.renderer.shadowMap.enabled = q !== 'low';
    this.key.castShadow = q !== 'low';
    this.key.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
    this.bloom.enabled = q !== 'low';
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    this.resize();
  }

  /** Call `fn` every frame; returns the function that stops it. */
  onFrame(fn: (dt: number, time: number) => void): () => void {
    this.frameHandlers.add(fn);
    return () => this.frameHandlers.delete(fn);
  }

  /** Run `step(t)` with t going 0 → 1 (eased) over `seconds`. */
  animate(seconds: number, step: (t: number) => void): Promise<void> {
    return new Promise((resolve) => {
      let elapsed = 0;
      const stop = this.onFrame((dt) => {
        elapsed += dt;
        const t = Math.min(1, elapsed / seconds);
        step(easeInOut(t));
        if (t >= 1) {
          stop();
          resolve();
        }
      });
    });
  }

  /** Fly the camera to look at `target` from `position`. */
  flyTo(position: THREE.Vector3, target: THREE.Vector3, seconds = 1.1): Promise<void> {
    const p0 = this.camera.position.clone();
    const t0 = this.controls.target.clone();
    return this.animate(seconds, (t) => {
      this.camera.position.lerpVectors(p0, position, t);
      this.controls.target.lerpVectors(t0, target, t);
    });
  }

  clearLevel(): void {
    this.level.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const m of mats) m.dispose();
    });
    this.level.clear();
  }

  private resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
  }

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const time = this.clock.elapsedTime;
    for (const fn of [...this.frameHandlers]) fn(dt, time);
    this.controls.update();
    if (this.quality === 'low') this.renderer.render(this.scene, this.camera);
    else this.composer.render(dt);
  }
}
