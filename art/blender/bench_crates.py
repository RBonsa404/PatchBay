"""The three crates on the bench's lower shelf (tools, testers, patch cords), labels to the front: the same crates as
the stock shelving, a little lower and wider.

    blender --background --factory-startup --python art/blender/bench_crates.py -- <out.glb> [preview.png]

Centred, floor at z = 0, front at y = -D/2 (+Z in the game). Three crates 0.42 x 0.5 x 0.24 m, 0.68 m apart.
"""
import os
import sys

sys.path.append(os.path.dirname(__file__))
import common as c  # noqa: E402
import storage as s  # noqa: E402

import bpy  # noqa: E402

c.reset()
s.materials()
parts = []
for i, label in enumerate(('OUTILLAGE', 'TESTEURS', 'CORDONS')):
    s.crate(parts, ((i - 1) * 0.68, 0, 0), label, w=0.42, d=0.5, h=0.24)

for o in parts:
    bpy.context.view_layer.objects.active = o
    for sel in bpy.context.selected_objects:
        sel.select_set(False)
    o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

body = c.join(parts, 'BenchCrates')
out = c.args()
c.export_glb(out[0])
print('exported', out[0], 'faces', len(body.data.polygons))
if len(out) > 1:
    c.preview(out[1], target=(0, -0.25, 0.12), distance=2.4, angle=(-20, 14))
