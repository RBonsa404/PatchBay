import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';

export type Quality = 'low' | 'medium' | 'high';

/** Vertical field of view on a wide screen, in degrees. */
const BASE_FOV = 48;

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
 * reflection environment built on the fly (no download), ambient occlusion, and bloom so that LEDs and screens glow.
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
  private flightId = 0;
  private zoomFactor = 1;
  /** Lights that cost too much on modest machines. */
  private readonly extraLights: THREE.Light[] = [];
  private readonly accents: THREE.Light[] = [];
  private readonly frontKey: THREE.SpotLight;
  private readonly ao: GTAOPass;
  private readonly vignette: ShaderPass;
  /** A mission drives the camera itself (first-person eyes); otherwise the orbit controls do. */
  manualCamera = false;

  constructor(private readonly container: HTMLElement, quality: Quality) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.02, 60);
    this.camera.position.set(0, 1.62, 2.15);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.92, -0.1);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.35;
    this.controls.maxDistance = 3.2;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.screenSpacePanning = true;

    this.scene.background = new THREE.Color('#9aa3af');
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.3;
    pmrem.dispose();

    // A room lit by its ceiling panels: little ambient light, so that the shadows stay dark. Each panel makes its own
    // pool of light; two of them cast shadows (one on the bench and the rack, one behind the player, so everything
    // standing on the floor or the bench is grounded). Cool panels against the warm key, and small coloured glows from
    // the machines themselves.
    this.scene.add(new THREE.HemisphereLight('#dfe8ff', '#3a3f4a', 0.44));
    this.key = new THREE.SpotLight('#ffe9cf', 15, 0, 0.82, 0.85, 1.6);
    this.key.position.set(0.4, 2.95, 0.6);
    this.key.target.position.set(0, 0.8, -0.1);
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    this.frontKey = new THREE.SpotLight('#f1f5ff', 9, 0, 0.95, 1, 1.6);
    this.frontKey.position.set(0.4, 2.95, 2.4);
    this.frontKey.target.position.set(0.1, 0, 1.3);
    this.frontKey.shadow.mapSize.set(1024, 1024);
    this.frontKey.shadow.bias = -0.0005;
    this.frontKey.shadow.normalBias = 0.03;
    this.scene.add(this.key, this.key.target, this.frontKey, this.frontKey.target);
    for (const [x, z] of [[-1.5, 0.3], [2.2, 0.3], [-1.5, 2.2], [2.2, 2.2]] as const) {
      const panel = new THREE.SpotLight('#dfe9ff', 7, 0, 1.05, 1, 1.6);
      panel.position.set(x, 2.95, z);
      panel.target.position.set(x, 0, z);
      this.scene.add(panel, panel.target);
      this.extraLights.push(panel);
    }
    // The server cabinet's glow on the floor and wall, the exit sign, and the screens on the bench.
    for (const [colour, power, reach, x, y, z] of [
      ['#38bdf8', 1.6, 2.8, 2.6, 1.0, 0.1],
      ['#22c55e', 0.5, 1.5, -2.95, 2.25, -1.4],
      ['#60a5fa', 0.5, 1.4, 0, 1.05, 0.2],
    ] as const) {
      const glow = new THREE.PointLight(colour, power, reach, 1.6);
      glow.position.set(x, y, z);
      this.scene.add(glow);
      this.accents.push(glow);
    }
    this.scene.add(this.level);

    // Multisampled, or the post-processing would lose the renderer's anti-aliasing.
    this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Ambient occlusion: the soft darkening where objects meet, which anchors them in the room.
    this.ao = new GTAOPass(this.scene, this.camera, 1, 1);
    this.ao.blendIntensity = 0.85;
    this.ao.updateGtaoMaterial({ radius: 0.22, distanceExponent: 1.4, thickness: 1, scale: 1.1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    this.composer.addPass(this.ao);
    // High threshold: only LEDs, screens and ceiling panels glow, not the lit walls.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.35, 0.97);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.vignette = new ShaderPass(VignetteShader);
    this.vignette.uniforms.offset!.value = 0.95;
    this.vignette.uniforms.darkness!.value = 1.15;
    this.composer.addPass(this.vignette);

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
    this.frontKey.castShadow = q === 'high';
    this.key.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
    this.bloom.enabled = q !== 'low';
    this.ao.enabled = q === 'high';
    this.vignette.enabled = q !== 'low';
    for (const light of this.extraLights) light.visible = q !== 'low';
    for (const light of this.accents) light.visible = q === 'high';
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

  /** Narrow the view (above 1) or widen it (below 1), like eyes focusing on something. */
  get zoom(): number {
    return this.zoomFactor;
  }

  set zoom(factor: number) {
    if (Math.abs(factor - this.zoomFactor) < 0.0005) return;
    this.zoomFactor = factor;
    this.applyFov();
  }

  /** Cancel the camera flight in progress: it stays where it is. */
  stopFlight(): void {
    this.flightId++;
  }

  /** Fly the camera to look at `target` from `position`. */
  flyTo(position: THREE.Vector3, target: THREE.Vector3, seconds = 1.1): Promise<void> {
    const id = ++this.flightId;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) seconds = 0.01;
    const p0 = this.camera.position.clone();
    const t0 = this.controls.target.clone();
    return this.animate(seconds, (t) => {
      if (id !== this.flightId) return;
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
    this.applyFov();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
  }

  private applyFov(): void {
    // Keep the bench's width in frame on narrow screens (phone in portrait): widen the vertical angle instead of
    // cropping the sides.
    const minAspect = 1.5;
    const half = Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2));
    const halfHeight = (this.camera.aspect >= minAspect ? half : (half * minAspect) / this.camera.aspect) / this.zoomFactor;
    this.camera.fov = Math.min(100, THREE.MathUtils.radToDeg(2 * Math.atan(halfHeight)));
    this.camera.updateProjectionMatrix();
  }

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const time = this.clock.elapsedTime;
    for (const fn of [...this.frameHandlers]) fn(dt, time);
    if (!this.manualCamera) this.controls.update();
    if (this.quality === 'low') this.renderer.render(this.scene, this.camera);
    else this.composer.render(dt);
  }
}
