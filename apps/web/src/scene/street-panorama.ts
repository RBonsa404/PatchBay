import * as THREE from 'three';
import { setDaytime } from './daytime.js';
import { PANORAMA_DOWN, PANORAMA_UP } from './outside.js';
import { loadProp } from './props.js';
import type { Stage } from './stage.js';

/**
 * Development tool: the campus's town seen through its windows, photographed from the modelled street itself rather
 * than from a foreign one. The street is shown in its daylight (noon, sun on, haze), everything else hidden, a cube
 * of views is taken from the panorama's centre at eye height, then unrolled into the band `outside.ts` lays on its
 * cylinder (azimuth across, angle from the horizon up the picture), tone mapped as the game does. The page returns it
 * as a JPEG for `tools/street-panorama.cjs` to save in `public/textures/outside/`.
 */

/** The game multiplies the town by up to 1.5 at noon (`daytime.ts`): the picture is stored that much darker. */
const STORED = 1 / 1.45;

const unroll = new THREE.ShaderMaterial({
  uniforms: { cube: { value: null }, up: { value: PANORAMA_UP }, down: { value: PANORAMA_DOWN }, gain: { value: STORED } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform samplerCube cube;
    uniform float up;
    uniform float down;
    uniform float gain;
    varying vec2 vUv;
    // Khronos PBR Neutral, as THREE.NeutralToneMapping.
    vec3 neutral(vec3 color) {
      const float start = 0.76;
      const float desaturation = 0.15;
      float x = min(color.r, min(color.g, color.b));
      float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
      color -= offset;
      float peak = max(color.r, max(color.g, color.b));
      if (peak < start) return color;
      float d = 1.0 - start;
      float newPeak = 1.0 - d * d / (peak + d - start);
      color *= newPeak / peak;
      float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
      return mix(color, vec3(newPeak), g);
    }
    vec3 srgb(vec3 c) {
      return mix(c * 12.92, pow(c, vec3(1.0 / 2.4)) * 1.055 - 0.055, step(vec3(0.0031308), c));
    }
    void main() {
      // The cylinder's texture runs the other way round (its u is flipped in outside.ts).
      float theta = (1.0 - vUv.x) * 6.28318530718;
      float phi = vUv.y * (up + down) - down;
      vec3 dir = vec3(sin(theta) * cos(phi), sin(phi), cos(theta) * cos(phi));
      vec3 c = textureCube(cube, dir).rgb;
      gl_FragColor = vec4(srgb(clamp(neutral(c) * gain, 0.0, 1.0)), 1.0);
    }`,
  depthTest: false,
  depthWrite: false,
});

export async function streetPanorama(stage: Stage, showStreet: (on: boolean) => void, centre: THREE.Vector3, width = 4096, height = 1081): Promise<string> {
  setDaytime('noon');
  showStreet(true);
  // Only the street, its sky and the lights: no building, no people, no photographed town.
  const street = stage.level.children.find((o) => o.name === 'street-campus');
  const hidden: THREE.Object3D[] = [];
  const hide = (o: THREE.Object3D): void => {
    if (o.visible) {
      o.visible = false;
      hidden.push(o);
    }
  };
  for (const o of stage.scene.children) if (o !== stage.level && !(o as THREE.Light).isLight) hide(o);
  for (const o of stage.level.children) if (o !== street && !(o as THREE.Light).isLight) hide(o);
  // Models load in the background: wait for the street's shops, trees and poles, then for them to be placed.
  await Promise.all(['shop_open', 'shop_closed', 'tree', 'pole', 'fence', 'gate'].map((name) => loadProp(name)));
  await new Promise((r) => setTimeout(r, 500));
  const target = new THREE.WebGLCubeRenderTarget(2048, { type: THREE.HalfFloatType, generateMipmaps: false });
  const cubeCamera = new THREE.CubeCamera(0.2, 500, target);
  cubeCamera.position.copy(centre);
  // A layer of its own: only the street and the lights are on it (people and anything else stay out of the picture).
  const LAYER = 7;
  const tagged: THREE.Object3D[] = [];
  street?.traverse((o) => tagged.push(o));
  stage.scene.traverse((o) => ((o as THREE.Light).isLight ? tagged.push(o) : null));
  for (const o of tagged) o.layers.enable(LAYER);
  cubeCamera.traverse((o) => o.layers.set(LAYER));
  stage.scene.add(cubeCamera);
  const renderer = stage.renderer;
  const shadows = renderer.shadowMap.autoUpdate;
  renderer.shadowMap.autoUpdate = true;
  renderer.shadowMap.needsUpdate = true;
  cubeCamera.update(renderer, stage.scene);
  renderer.shadowMap.autoUpdate = shadows;
  // Unroll the cube into the band.
  const out = new THREE.WebGLRenderTarget(width, height);
  unroll.uniforms.cube!.value = target.texture;
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), unroll);
  const flat = new THREE.Scene();
  flat.add(quad);
  renderer.setRenderTarget(out);
  renderer.render(flat, new THREE.Camera());
  const pixels = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(out, 0, 0, width, height, pixels);
  renderer.setRenderTarget(null);
  // WebGL reads from the bottom row: the picture's top is the sky.
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  const image = g.createImageData(width, height);
  for (let y = 0; y < height; y++) image.data.set(pixels.subarray((height - 1 - y) * width * 4, (height - y) * width * 4), y * width * 4);
  g.putImageData(image, 0, 0);
  stage.scene.remove(cubeCamera);
  for (const o of tagged) o.layers.disable(LAYER);
  target.dispose();
  out.dispose();
  for (const o of hidden) o.visible = true;
  showStreet(false);
  return canvas.toDataURL('image/jpeg', 0.88);
}
