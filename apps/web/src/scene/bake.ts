import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merge the still meshes of a group into one mesh per kind of material, so that a whole room is a few dozen draw calls
 * instead of thousands: what keeps a large building playable on a modest PC. Objects marked `userData.dynamic`, and
 * whatever is under them, are left as they are.
 */
export function bake(group: THREE.Group): void {
  group.updateMatrixWorld(true);
  const toLocal = group.matrixWorld.clone().invert();
  const buckets = new Map<string, { material: THREE.Material; mesh: THREE.Mesh; geometries: THREE.BufferGeometry[] }>();
  const baked: THREE.Mesh[] = [];
  const visit = (o: THREE.Object3D): void => {
    if (o.userData.dynamic) return;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !Array.isArray(mesh.material)) {
      const m = mesh.material as THREE.MeshStandardMaterial;
      const key = [m.type, m.color?.getHexString(), m.roughness, m.metalness, m.map?.uuid, m.transparent, m.opacity, m.toneMapped, m.depthWrite, m.side, m.emissive?.getHexString(), m.emissiveIntensity, m.envMapIntensity, mesh.renderOrder, mesh.castShadow, mesh.receiveShadow].join('|');
      const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      for (const name of Object.keys(source.attributes)) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv') source.deleteAttribute(name);
      }
      if (!source.attributes.uv) source.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((source.attributes.position as THREE.BufferAttribute).count * 2), 2));
      source.applyMatrix4(toLocal.clone().multiply(mesh.matrixWorld));
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { material: m, mesh, geometries: [] };
        buckets.set(key, bucket);
      }
      bucket.geometries.push(source);
      baked.push(mesh);
    }
    o.children.forEach(visit);
  };
  group.children.forEach(visit);
  for (const mesh of baked) {
    mesh.geometry.dispose();
    mesh.parent?.remove(mesh);
  }
  for (const { material, mesh, geometries } of buckets.values()) {
    const merged = mergeGeometries(geometries, false);
    for (const g of geometries) g.dispose();
    if (!merged) continue;
    const out = new THREE.Mesh(merged, material);
    out.castShadow = mesh.castShadow;
    out.receiveShadow = mesh.receiveShadow;
    out.renderOrder = mesh.renderOrder;
    group.add(out);
  }
}
