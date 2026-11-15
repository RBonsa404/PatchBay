import * as THREE from 'three';

/**
 * Light baked in Blender (Cycles), brought back onto the still parts of the building as textures: the ceiling panels'
 * soft light, the daylight from the windows and the light bouncing from wall to floor, computed once instead of on
 * every frame. The game then needs only the lights that must move or cast the shadows of what the player handles.
 *
 * `tools/bake/` writes, in `assets/lightmaps/`: one picture of the light per part, one file with the second set of
 * texture coordinates of each of its meshes, and the manifest that ties them to the meshes by name and signature. A
 * mesh whose vertices changed since the bake keeps its real-time light only.
 */

/** The parts of the building that have their own baked light. */
export const LIGHTMAPPED_PARTS = ['technical-room', 'part-lab', 'part-lower', 'part-stairs', 'part-office', 'part-upper', 'part-west', 'part-classes'] as const;

interface BakedMesh {
  name: string;
  signature: string;
  /** Where its coordinates start in the part's file, and how many vertices it has. */
  offset: number;
  count: number;
}

interface Manifest {
  /** What one unit of the picture is worth in the game's light. */
  intensity: number;
  parts: Record<string, { image: string; coords: string; scale: number; meshes: BakedMesh[] }>;
}

const manifests = import.meta.glob<Manifest>('../assets/lightmaps/manifest.json', { eager: true, import: 'default' });
const files = import.meta.glob<string>('../assets/lightmaps/*.{webp,png,bin}', { eager: true, query: '?url', import: 'default' });
const manifest: Manifest | undefined = Object.values(manifests)[0];
const url = (name: string): string | undefined => files[`../assets/lightmaps/${name}`];

interface Loaded {
  texture: THREE.Texture;
  coords: Uint16Array;
  intensity: number;
  meshes: Map<string, BakedMesh>;
}

const loaded = new Map<string, Loaded>();
let ready: Promise<boolean> | null = null;

/** Fetch every part's light once, at start-up, so that a room appears already lit. True when there is baked light. */
export function preloadLightmaps(): Promise<boolean> {
  ready ??= (async () => {
    if (!manifest) return false;
    const loader = new THREE.TextureLoader();
    await Promise.all(Object.entries(manifest.parts).map(async ([part, entry]) => {
      const [image, coords] = [url(entry.image), url(entry.coords)];
      if (!image || !coords) return;
      try {
        const [texture, buffer] = await Promise.all([loader.loadAsync(image), fetch(coords).then((r) => r.arrayBuffer())]);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.channel = 1;
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        loaded.set(part, { texture, coords: new Uint16Array(buffer), intensity: manifest.intensity * entry.scale, meshes: new Map(entry.meshes.map((m) => [m.name, m])) });
      } catch {
        // that part keeps its real-time light
      }
    }));
    return loaded.size > 0;
  })();
  return ready;
}

/** Whether the baked light of this part was found (the game then drops the lights it replaces). */
export function hasLightmap(part: string): boolean {
  return loaded.has(part);
}

/**
 * A baked surface already holds the ambient light, the reflections of the room and the light of the panels: it takes
 * from the real-time lights only the direct light of the two panels over the bench (spot lights, with the shadows of
 * the equipment), not the sky, the lamps that follow the player, or the diffuse part of the reflections.
 */
const BEGIN = THREE.ShaderChunk.lights_fragment_begin
  .replace('#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )', '#if 0')
  .replace('irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );', '');
const MAPS = THREE.ShaderChunk.lights_fragment_maps.replace('iblIrradiance += getIBLIrradiance( geometryNormal );', '');

export function bakedOnly(material: THREE.Material): void {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', BEGIN).replace('#include <lights_fragment_maps>', MAPS);
  };
  material.customProgramCacheKey = () => 'baked-light';
}

const lit = new WeakMap<THREE.Material, Map<string, THREE.Material>>();

/** Put the baked light on the meshes of a part of the building. Returns how many meshes received it. */
export function applyLightmap(group: THREE.Object3D): number {
  const entry = loaded.get(group.name);
  if (!entry) return 0;
  let count = 0;
  let stale = 0;
  for (const child of group.children) {
    const mesh = child as THREE.Mesh;
    const baked = entry.meshes.get(mesh.name);
    if (!mesh.isMesh || !baked || Array.isArray(mesh.material)) continue;
    if (baked.signature !== mesh.userData.signature) {
      stale++;
      continue;
    }
    const coords = entry.coords.subarray(baked.offset * 2, (baked.offset + baked.count) * 2);
    mesh.geometry.setAttribute('uv1', new THREE.BufferAttribute(coords, 2, true));
    const source = mesh.material;
    let copies = lit.get(source);
    if (!copies) lit.set(source, (copies = new Map()));
    let material = copies.get(group.name);
    if (!material) {
      const copy = source.clone() as THREE.MeshStandardMaterial;
      copy.lightMap = entry.texture;
      copy.lightMapIntensity = entry.intensity;
      bakedOnly(copy);
      copies.set(group.name, (material = copy));
    }
    mesh.material = material;
    count++;
  }
  if (stale && import.meta.env.DEV) console.error(`${group.name}: ${stale} meshes changed since the light was baked (npm run bake)`);
  return count;
}
