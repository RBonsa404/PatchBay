import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { dustTexture } from './materials.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';

export type Quality = 'low' | 'medium' | 'high';

function dustMotes(): THREE.Points {
  const count = 260;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 6.4;
    positions[i * 3 + 1] = 0.3 + Math.random() * 2.4;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 4.6;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#fff4e0', map: dustTexture(), size: 0.012, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  points.position.z = 1;
  return points;
}

/** Vertical field of view on a wide screen, in degrees. */
const BASE_FOV = 48;

const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Frames per second: in a mission, behind the menus, and when nothing has moved for a moment. */
const ACTIVE_FPS = 60;
const MENU_FPS = 24;
const REST_FPS = 8;
/** Milliseconds without a movement before the rest pace. */
const REST_AFTER = 1000;
/** How much a generic reflection counts, without the picture of the real room that only the high quality takes. */
const PLAIN_REFLECTIONS = 0.45;

function softwareRenderer(): boolean {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return false;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '');
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /swiftshader|llvmpipe|basic render|software/i.test(name);
}

/** A guess good enough to start with; the game lowers it if the machine struggles, and the player can change it from the HUD. */
export function detectQuality(): Quality {
  // Medium for everyone: the game is played for hours on laptops, on battery. The full effects are a choice.
  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  try {
    const saved = localStorage.getItem('patchbay.quality');
    if (saved === 'low' || saved === 'medium' || saved === 'high') return saved;
  } catch {
    // storage unavailable: detect each time
  }
  if (cores <= 2 || memory <= 2 || /Android|iPhone|iPad/.test(navigator.userAgent) || softwareRenderer()) return 'low';
  return 'medium';
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
  private readonly sky = new THREE.HemisphereLight('#f5f3ee', '#6a6761', 0.74);
  /** The game may lower the quality by itself, until the player chooses one. */
  private adaptive = true;
  private slowSpells = 0;
  /** Told when the game has lowered the quality by itself. */
  onQualityLowered: ((q: Quality) => void) | null = null;
  /**
   * Two lamps that follow the player from room to corridor to stairs. Their number never changes, whatever is on screen:
   * a light appearing or disappearing would make every material compile again, in the middle of a walk.
   */
  private readonly lamps = [new THREE.PointLight('#fff4e4', 6, 9, 1.5), new THREE.PointLight('#fff4e4', 6, 9, 1.5)] as const;
  private drawnAt = 0;
  private readonly plainEnvironment: THREE.Texture;
  /** Shaders are being compiled in the background: drawing now would freeze the page until they are ready. */
  private preparing = false;
  private readonly simplified = new WeakMap<THREE.Material, THREE.MeshLambertMaterial>();
  private awakeUntil = 0;
  private readonly seenPosition = new THREE.Vector3();
  private readonly seenAngle = new THREE.Quaternion();
  private shadowNow = false;
  private shadowLater = 0;
  private flightId = 0;
  private rigZ = 0;
  private rigY = 0;
  private zoomFactor = 1;
  /** Lights that cost too much on modest machines. */
  private readonly extraLights: THREE.SpotLight[] = [];
  private readonly accents: THREE.Light[] = [];
  private readonly frontKey: THREE.SpotLight;
  private readonly ao: GTAOPass;
  private readonly vignette: ShaderPass;
  private readonly grade: ShaderPass;
  /** How far the game has lightened itself to stay fluid: 0 is everything on. */
  private relief = 0;
  private sampled = 0;
  private frames = 0;
  /** Dust in the air, catching the light: slow, faint, and what makes the air of a room visible. */
  private readonly dust = dustMotes();
  /** A mission drives the camera itself (first-person eyes); otherwise the orbit controls do. */
  manualCamera = false;

  constructor(private readonly container: HTMLElement, quality: Quality) {
    this.quality = quality;
    try {
      this.adaptive = localStorage.getItem('patchbay.quality.chosen') === null;
    } catch {
      // storage unavailable: keep adapting
    }
    // The default graphics chip: asking for the most powerful one would drain a laptop's battery for a game about cables.
    this.renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low' });
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Asking the driver for each shader's log makes every compilation wait.
    this.renderer.debug.checkShaderErrors = import.meta.env.DEV;
    this.renderer.shadowMap.type = THREE.VSMShadowMap;
    // The room stands still: shadows are drawn again only when something in it changes (see `refreshShadows`).
    this.renderer.shadowMap.autoUpdate = false;
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
    this.plainEnvironment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.plainEnvironment;
    this.scene.environmentIntensity = PLAIN_REFLECTIONS;
    pmrem.dispose();

    // A room lit by its ceiling panels: little ambient light, so that the shadows stay dark. Each panel makes its own
    // pool of light; two of them cast shadows (one on the bench and the rack, one behind the player, so everything
    // standing on the floor or the bench is grounded). Cool panels against the warm key, and small coloured glows from
    // the machines themselves.
    this.scene.add(this.sky);
    this.key = new THREE.SpotLight('#fff1dd', 13, 0, 0.9, 0.9, 1.6);
    this.key.position.set(0.4, 2.95, 0.6);
    this.key.target.position.set(0, 0.8, -0.1);
    this.key.shadow.mapSize.set(4096, 4096);
    this.key.shadow.bias = -0.0002;
    this.key.shadow.normalBias = 0.02;
    this.key.shadow.radius = 5;
    this.key.shadow.blurSamples = 16;
    this.frontKey = new THREE.SpotLight('#fff7ec', 8, 0, 1, 1, 1.6);
    this.frontKey.position.set(0.4, 2.95, 2.4);
    this.frontKey.target.position.set(0.1, 0, 1.3);
    this.frontKey.shadow.mapSize.set(2048, 2048);
    this.frontKey.shadow.bias = -0.0003;
    this.frontKey.shadow.normalBias = 0.03;
    this.frontKey.shadow.radius = 7;
    this.frontKey.shadow.blurSamples = 16;
    this.scene.add(this.key, this.key.target, this.frontKey, this.frontKey.target);
    for (const [x, z] of [[-1.5, 0.3], [2.2, 0.3], [-1.5, 2.2], [2.2, 2.2]] as const) {
      const panel = new THREE.SpotLight('#fff5e8', 6, 0, 1.1, 1, 1.6);
      panel.position.set(x, 2.95, z);
      panel.target.position.set(x, 0, z);
      this.scene.add(panel, panel.target);
      this.extraLights.push(panel);
    }
    // The server cabinet's glow on the floor and wall, the exit sign, and the screens on the bench.
    for (const [colour, power, reach, x, y, z] of [
      ['#38bdf8', 0.9, 2.4, 2.05, 0.5, 0.2],
      ['#22c55e', 0.5, 1.5, -2.95, 2.25, -1.4],
      ['#a8c4f0', 0.16, 1.2, 0, 1.2, 0.2],
    ] as const) {
      const glow = new THREE.PointLight(colour, power, reach, 1.6);
      glow.position.set(x, y, z);
      this.scene.add(glow);
      this.accents.push(glow);
    }
    this.scene.add(...this.lamps);
    this.placeLamps();
    this.scene.add(this.level);
    this.scene.add(this.dust);

    // Multisampled, or the post-processing would lose the renderer's anti-aliasing.
    this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Ambient occlusion: the soft darkening where objects meet, which anchors them in the room.
    this.ao = new GTAOPass(this.scene, this.camera, 1, 1);
    this.ao.blendIntensity = 0.85;
    this.ao.updateGtaoMaterial({ radius: 0.3, distanceExponent: 1.4, thickness: 1, scale: 1.1, samples: 14, distanceFallOff: 1, screenSpaceRadius: false });
    this.ao.updatePdMaterial({ lumaPhi: 1.5, samples: 16, rings: 2, radius: 16 });
    // By far the dearest effect of the frame, and a soft one: half the resolution does not show, and costs a quarter.
    const sizeAo = this.ao.setSize.bind(this.ao);
    this.ao.setSize = (w, h) => sizeAo(Math.ceil(w / 2), Math.ceil(h / 2));
    this.composer.addPass(this.ao);
    // High threshold: only LEDs, screens and ceiling panels glow, not the lit walls.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.28, 0.5, 1);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.vignette = new ShaderPass(VignetteShader);
    this.vignette.uniforms.offset!.value = 0.95;
    this.vignette.uniforms.darkness!.value = 0.75;
    this.composer.addPass(this.vignette);
    // A light grade: a little more contrast and colour than the raw render.
    this.grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
        void main() {
          vec4 c = texture2D(tDiffuse, vUv);
          float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
          vec3 v = mix(vec3(l), c.rgb, 1.06);
          v = mix(v, v * v * (3.0 - 2.0 * v), 0.14);
          // Dither: no banding in the walls' soft gradients.
          float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
          gl_FragColor = vec4(v + (n - 0.5) / 255.0, c.a);
        }`,
    });
    this.composer.addPass(this.grade);

    this.setQuality(quality);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.listenForActivity();
    this.renderer.setAnimationLoop((now) => this.frame(now));
  }

  get currentQuality(): Quality {
    return this.quality;
  }

  /**
   * High: every effect. Medium: drawn straight to the screen, no post-processing, half the small lights. Low: no shadows
   * and two lights. Each step down roughly halves what the graphics chip has to do.
   */
  setQuality(q: Quality): void {
    this.quality = q;
    const full = q === 'high';
    this.renderer.setPixelRatio(q === 'low' ? 1 : Math.min(window.devicePixelRatio, full ? 1.5 : 1.25));
    this.renderer.shadowMap.enabled = q !== 'low';
    this.key.castShadow = q !== 'low';
    this.frontKey.castShadow = q !== 'low';
    const size = full ? 2048 : 1024;
    this.key.shadow.mapSize.set(size, size);
    this.frontKey.shadow.mapSize.set(1024, 1024);
    this.key.shadow.blurSamples = this.frontKey.shadow.blurSamples = full ? 16 : 8;
    for (const light of [this.key, this.frontKey]) {
      light.shadow.map?.dispose();
      light.shadow.map = null;
    }
    this.bloom.enabled = full;
    this.ao.enabled = full;
    this.vignette.enabled = full;
    this.grade.enabled = full;
    if (!full) {
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
    }
    this.dust.visible = q !== 'low';
    this.relief = 0;
    this.refreshShadows(1);
    if (!full && this.scene.environment !== this.plainEnvironment) {
      this.scene.environment?.dispose();
      this.scene.environment = this.plainEnvironment;
      this.scene.environmentIntensity = PLAIN_REFLECTIONS;
    } else if (full && this.scene.getObjectByName('technical-room')) {
      this.captureEnvironment();
    }
    this.setSimple(q === 'low');
    // Fewer lights, the sky making up for them: a light costs on every pixel of the screen.
    for (const light of this.extraLights) light.visible = full;
    for (const light of this.accents) light.visible = full;
    this.sky.intensity = full ? 0.74 : q === 'medium' ? 0.74 : 1.2;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && !Array.isArray(m)) m.needsUpdate = true;
    });
    this.resize();
  }

  /** Where the two lamps go, and how strong they are: [x, y, z, power]. By default, over the technical room. */
  placeLamps(a: readonly [number, number, number, number] = [2.2, 2.9, 0.3, 4], b: readonly [number, number, number, number] = [-1.5, 2.9, 2.2, 4]): void {
    [a, b].forEach(([x, y, z, power], i) => {
      const lamp = this.lamps[i] as THREE.PointLight;
      lamp.position.set(x, y, z);
      lamp.intensity = power;
    });
  }

  /** Compile what is in the scene without freezing the page. Nothing is drawn until it is done. */
  async prepare(): Promise<void> {
    this.preparing = true;
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      // the first frame will compile what is left
    }
    this.preparing = false;
    this.wake();
  }

  /** Low quality: the plainest lit material on everything, many times cheaper to draw on a weak graphics chip. */
  private setSimple(on: boolean): void {
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (on) this.simplify(mesh);
      else if (mesh.userData.fullMaterial) {
        mesh.material = mesh.userData.fullMaterial as THREE.Material;
        delete mesh.userData.fullMaterial;
      }
    });
  }

  private simplify(mesh: THREE.Mesh): void {
    const full = mesh.material as THREE.MeshStandardMaterial;
    if (!full.isMeshStandardMaterial) return;
    let plain = this.simplified.get(full);
    if (!plain) {
      plain = new THREE.MeshLambertMaterial({
        map: full.map,
        color: full.color,
        emissive: full.emissive,
        emissiveMap: full.emissiveMap,
        emissiveIntensity: full.emissiveIntensity,
        transparent: full.transparent,
        opacity: full.opacity,
        side: full.side,
        alphaTest: full.alphaTest,
        depthWrite: full.depthWrite,
      });
      this.simplified.set(full, plain);
    }
    mesh.userData.fullMaterial = full;
    mesh.material = plain;
  }

  /** The player's own choice: it is kept, and the game no longer changes it. */
  chooseQuality(q: Quality): void {
    this.adaptive = false;
    this.setQuality(q);
    try {
      localStorage.setItem('patchbay.quality', q);
      localStorage.setItem('patchbay.quality.chosen', '1');
    } catch {
      // storage unavailable: the choice lasts until the page closes
    }
  }

  /** Something on screen is moving or about to: leave the rest pace. */
  wake(): void {
    this.awakeUntil = performance.now() + REST_AFTER;
  }

  /** Only what can change the 3D view wakes it: typing in a console or moving over a panel does not. */
  private listenForActivity(): void {
    const canvas = this.renderer.domElement;
    const onCanvas = (e: Event): void => {
      if (e.target === canvas) this.wake();
    };
    for (const name of ['pointermove', 'wheel', 'touchmove'] as const) document.addEventListener(name, onCanvas, { passive: true });
    document.addEventListener('pointerdown', () => this.wake(), { passive: true });
    document.addEventListener('keydown', (e) => {
      if (!(e.target as HTMLElement).closest?.('input, textarea')) this.wake();
    });
  }

  /** Draw the shadows again now, and once more when what has just changed has settled, `seconds` from now. */
  refreshShadows(seconds = 1): void {
    this.shadowNow = true;
    this.shadowLater = Math.max(this.shadowLater, performance.now() + seconds * 1000);
  }

  /**
   * The room's real image as its reflection: floors, metal and glass mirror the walls and the ceiling lights. Taken
   * once, from the middle of the room, once the room is built.
   */
  captureEnvironment(): void {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const previous = this.scene.environment;
    this.scene.environment = null;
    this.scene.position.set(0, -1.5, -1);
    this.scene.updateMatrixWorld(true);
    const target = pmrem.fromScene(this.scene, 0.02, 0.1, 30);
    this.scene.position.set(0, 0, 0);
    this.scene.updateMatrixWorld(true);
    this.scene.environment = target.texture;
    this.scene.environmentIntensity = 0.75;
    if (previous !== this.plainEnvironment) previous?.dispose();
    pmrem.dispose();
  }

  /** Stay fluid on the machine it is given: when a mission stays slow, step down, and start there next time. */
  private adapt(gap: number): void {
    if (!this.adaptive || gap > 0.5) return;
    this.sampled += gap;
    this.frames++;
    if (this.sampled < 3) return;
    const fps = this.frames / this.sampled;
    this.sampled = 0;
    this.frames = 0;
    // Behind the menus the pace is lower by design: only a really slow machine counts as slow there.
    if (fps >= (this.manualCamera ? 40 : 15)) {
      this.slowSpells = 0;
      return;
    }
    if (++this.slowSpells < 2) return;
    this.slowSpells = 0;
    if (this.quality === 'low') {
      if (this.relief > 0) return;
      this.relief = 1;
      this.renderer.setPixelRatio(0.75);
      this.resize();
      return;
    }
    const lower: Quality = this.quality === 'high' ? 'medium' : 'low';
    this.setQuality(lower);
    this.onQualityLowered?.(lower);
    try {
      localStorage.setItem('patchbay.quality', lower);
    } catch {
      // storage unavailable: detect again next time
    }
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
      this.wake();
      const stop = this.onFrame((dt) => {
        this.wake();
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

  /** Move the ceiling lights over the room at this height and depth: only the occupied room is fully lit. */
  setRig(y: number, z: number): void {
    if (y === this.rigY && z === this.rigZ) return;
    const [dy, dz] = [y - this.rigY, z - this.rigZ];
    this.refreshShadows(0.3);
    this.rigY = y;
    this.rigZ = z;
    // The coloured glows belong to the technical room's machines: they stay there.
    for (const light of [this.key, this.frontKey, ...this.extraLights]) {
      light.position.y += dy;
      light.position.z += dz;
      light.target.position.y += dy;
      light.target.position.z += dz;
    }
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

  /**
   * Materials are not disposed of: that would throw away their compiled shaders, and the next mission would compile them
   * all over again. Textures are, for the screens and boards of each mission; one used again is simply sent back.
   */
  clearLevel(): void {
    const textures = new Set<THREE.Texture>();
    this.level.traverse((o) => {
      const mesh = o as THREE.Mesh;
      (o as THREE.InstancedMesh).dispose?.();
      mesh.geometry?.dispose();
      const material = mesh.material as THREE.MeshStandardMaterial | undefined;
      if (material?.map) textures.add(material.map);
    });
    for (const texture of textures) texture.dispose();
    this.level.clear();
    this.refreshShadows(2);
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

  private frame(now: number): void {
    if (this.preparing) return;
    const awake = now < this.awakeUntil;
    const pace = !awake ? REST_FPS : this.manualCamera ? ACTIVE_FPS : MENU_FPS;
    if (now - this.drawnAt < 1000 / pace - 2) return;
    const gap = (now - this.drawnAt) / 1000;
    this.drawnAt = now;
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const time = this.clock.elapsedTime;
    for (const fn of [...this.frameHandlers]) fn(dt, time);
    this.dust.rotation.y = time * 0.006;
    this.dust.position.y = Math.sin(time * 0.1) * 0.04 + this.rigY;
    this.dust.position.z = 1 + this.rigZ;
    if (!this.manualCamera) this.controls.update();
    if (this.camera.position.distanceToSquared(this.seenPosition) > 1e-8 || this.camera.quaternion.angleTo(this.seenAngle) > 1e-4) {
      this.seenPosition.copy(this.camera.position);
      this.seenAngle.copy(this.camera.quaternion);
      this.wake();
    }
    const due = this.shadowLater > 0 && now >= this.shadowLater;
    if (this.shadowNow || due) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowNow = false;
      if (due) this.shadowLater = 0;
    }
    if (awake) this.adapt(gap);
    // What has just been built or lit comes with its full material.
    if (this.quality === 'low') {
      this.scene.traverseVisible((o) => {
        if ((o as THREE.Mesh).isMesh && !(o as THREE.Mesh).userData.fullMaterial) this.simplify(o as THREE.Mesh);
      });
    }
    if (this.quality === 'high') this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
