import * as THREE from 'three';

/**
 * What lies beyond the windows: a photographed panorama (Poly Haven, CC0) on a wide cylinder around the building,
 * far enough to move with the eye as a real landscape does. Seen only through the openings of the outside walls.
 */

const loader = new THREE.TextureLoader();
const textures = new Map<string, THREE.Texture>();

/** Angles the band covers above and below the horizon (see how `panorama.jpg` is cut). */
const UP = (60 * Math.PI) / 180;
const DOWN = (35 * Math.PI) / 180;

/** `view`: the town around this site (campus: a street of Ouagadougou; agency: an avenue; operator: its industrial zone). */
export function panorama(view: 'campus' | 'agence' | 'datacenter', cx: number, cz: number, radius: number, eye = 1.6, turn = 0): THREE.Mesh {
  let texture = textures.get(view);
  if (!texture) {
    const t = loader.load(`${import.meta.env.BASE_URL}textures/outside/panorama-${view}.jpg`);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = 4;
    textures.set(view, t);
    texture = t;
  }
  const top = Math.tan(UP) * radius;
  const bottom = Math.tan(DOWN) * radius;
  const geometry = new THREE.CylinderGeometry(radius, radius, top + bottom, 96, 8, true);
  // The image is in angles, the cylinder in heights: bend the rows so that the horizon stays straight and level.
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) + (top + bottom) / 2 - bottom;
    const angle = Math.atan2(h, radius);
    uv.setY(i, (angle + DOWN) / (UP + DOWN));
    uv.setX(i, 1 - uv.getX(i));
  }
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, color: new THREE.Color(1.45, 1.42, 1.36), side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false }));
  mesh.position.set(cx, eye + (top - bottom) / 2, cz);
  mesh.rotation.y = turn;
  mesh.renderOrder = -10;
  mesh.name = `panorama-${view}`;
  mesh.userData.dynamic = true;
  mesh.frustumCulled = false;
  return mesh;
}
