"""Fetch a CC0 model from Poly Haven and make it light enough for the game: textures at 512 px in WebP, one GLB.

    blender --background --factory-startup --python art/blender/polyhaven.py -- <asset> <out.glb> [max_px] [ratio]

`ratio` (< 1) decimates the meshes. The files are downloaded into a fresh folder of the system's temporary directory.
"""
import json
import os
import sys
import tempfile
import urllib.request

import bpy

sys.path.append(os.path.dirname(__file__))
import common as c  # noqa: E402

argv = c.args()
asset, out = argv[0], argv[1]
max_px = int(argv[2]) if len(argv) > 2 else 512
ratio = float(argv[3]) if len(argv) > 3 else 1.0
UA = {'User-Agent': 'ist-network-lab-asset-import'}


def fetch(url, path=None):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req) as r:
        data = r.read()
    if path is None:
        return data
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(data)
    return path


files = json.loads(fetch(f'https://api.polyhaven.com/files/{asset}'))
gltf = files['gltf']['1k']['gltf']
work = tempfile.mkdtemp(prefix=f'ph-{asset}-')
main = fetch(gltf['url'], os.path.join(work, os.path.basename(gltf['url'])))
for rel, info in gltf.get('include', {}).items():
    fetch(info['url'], os.path.join(work, rel))

c.reset()
bpy.ops.import_scene.gltf(filepath=main)
for img in bpy.data.images:
    if img.size[0] > max_px:
        scale = max_px / img.size[0]
        img.scale(max_px, max(1, int(img.size[1] * scale)))
if ratio < 1:
    for o in bpy.data.objects:
        if o.type == 'MESH':
            m = o.modifiers.new('decimate', 'DECIMATE')
            m.ratio = ratio
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_yup=True, export_image_format='WEBP', export_cameras=False, export_lights=False)
faces = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
print('exported', out, 'faces', faces, 'bytes', os.path.getsize(out))
