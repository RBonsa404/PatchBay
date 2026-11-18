"""The technical room's lab bench, its steel part: four square-tube legs on levelling feet, the side stretchers that
carry the lower shelf, the aprons under the top, and the three-drawer pedestal on the right with its pull handles, its
key lock and the label holders. The laminate top, the anti-static mat and the shelf stay in the game (photo textures).

    blender --background --factory-startup --python art/blender/bench_frame.py -- <out.glb> [preview.png]

Centred on the bench, floor at z = 0, front at y = -D/2 (+Z in the game). 3.20 x 1.10 m; the top's underside at
0.718 m.
"""
import math
import os
import sys

import bpy

sys.path.append(os.path.dirname(__file__))
import common as c  # noqa: E402

mm = 0.001
W, D = 3.2, 1.1
TOP = 0.76 - 0.042  # underside of the laminate top
c.reset()
M = {
    'frame': c.material('frame', '#475569', 0.45, 0.8),
    'cap': c.material('cap', '#1b1f24', 0.8),
    'foot': c.material('foot', '#8e98a3', 0.35, 0.9),
    'rubber': c.material('rubber', '#111111', 0.9),
    'carcass': c.material('carcass', '#64748b', 0.5, 0.5),
    'drawer': c.material('drawer', '#6b7a90', 0.45, 0.5),
    'chrome': c.material('chrome', '#cbd5e1', 0.22, 1.0),
    'seam': c.material('seam', '#1e2632', 0.7, 0.2),
    'label': c.material('label', '#f1f5f9', 0.6),
}
parts = []


def cylinder(name, radius, depth, at, mat, vertices=20, rotate=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=at, rotation=rotate)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


# Legs: 45 mm square tube, rounded, a plastic cap under the top, a threaded levelling foot.
for x in (-W / 2 + 0.05, W / 2 - 0.05):
    for y in (-D / 2 + 0.06, D / 2 - 0.06):
        parts.append(c.box(f'leg{x}{y}', (0.045, 0.045, TOP - 0.03), (x, y, 0.03 + (TOP - 0.03) / 2), M['frame'], bevel=4 * mm, segments=2))
        parts.append(cylinder(f'thread{x}{y}', 6 * mm, 0.02, (x, y, 0.02), M['foot'], 12))
        parts.append(cylinder(f'pad{x}{y}', 0.022, 0.01, (x, y, 0.005), M['rubber'], 24))
    # Side stretcher carrying the shelf, and the top's side rail.
    parts.append(c.box(f'stretcher{x}', (0.035, D - 0.1, 0.035), (x, 0, 0.14), M['frame'], bevel=3 * mm, segments=2))
    parts.append(c.box(f'side-rail{x}', (0.03, D - 0.17, 0.05), (x, 0, TOP - 0.025), M['frame'], bevel=3 * mm, segments=2))
    for y in (-D / 2 + 0.06, D / 2 - 0.06):
        parts.append(c.box(f'plate{x}{y}', (0.07, 0.07, 4 * mm), (x, y, TOP - 0.002), M['frame'], bevel=1 * mm, segments=1))

# Aprons under the top, front and back, and a centre brace.
# The front apron stops either side of the drawer pedestal, so that its top drawer opens.
parts.append(c.box('apron-back', (W - 0.1, 0.02, 0.06), (0, D / 2 - 0.07, TOP - 0.03), M['frame'], bevel=2 * mm, segments=2))
for x0, x1 in ((-W / 2 + 0.05, 0.86), (1.34, W / 2 - 0.05)):
    parts.append(c.box(f'apron-front{x0}', (x1 - x0, 0.02, 0.06), ((x0 + x1) / 2, -D / 2 + 0.07, TOP - 0.03), M['frame'], bevel=2 * mm, segments=2))
parts.append(c.box('brace', (0.03, D - 0.16, 0.04), (0, 0, TOP - 0.02), M['frame'], bevel=2 * mm, segments=1))

# The drawer pedestal under the right of the top: carcass, three drawers, handles, lock, label holders.
PX, PY, PW, PH, PD = 1.1, -0.1, 0.45, 0.55, 0.6
PZ = 0.17
front = PY - PD / 2
parts.append(c.box('carcass', (PW, PD, PH), (PX, PY, PZ + PH / 2), M['carcass'], bevel=2.5 * mm, segments=2))
parts.append(c.box('kick', (PW - 0.02, 0.02, 0.03), (PX, front + 0.012, PZ - 0.012), M['cap'], bevel=1 * mm, segments=1))
heights = (0.17, 0.17, 0.19)
z = PZ + PH - 0.012
for i, h in enumerate(heights):
    zc = z - h / 2
    parts.append(c.box(f'drawer{i}', (PW - 0.016, 0.018, h - 0.006), (PX, front - 0.007, zc), M['drawer'], bevel=2 * mm, segments=2))
    parts.append(c.box(f'handle{i}', (0.16, 0.012, 0.014), (PX, front - 0.026, zc + h / 2 - 0.04), M['chrome'], bevel=4 * mm, segments=2))
    for s in (-1, 1):
        parts.append(c.box(f'handle-post{i}{s}', (0.012, 0.012, 0.012), (PX + s * 0.072, front - 0.019, zc + h / 2 - 0.04), M['chrome'], bevel=3 * mm, segments=1))
    parts.append(c.box(f'label{i}', (0.07, 1.5 * mm, 0.025), (PX, front - 0.0165, zc - 0.02), M['label'], bevel=0.8 * mm, segments=1))
    parts.append(c.box(f'label-frame{i}', (0.076, 1 * mm, 0.031), (PX, front - 0.016, zc - 0.02), M['chrome'], bevel=0.8 * mm, segments=1))
    z -= h
parts.append(cylinder('lock', 8 * mm, 5 * mm, (PX + 0.17, front - 0.017, PZ + PH - 0.04), M['chrome'], 24, rotate=(math.pi / 2, 0, 0)))
parts.append(c.box('keyway', (1.5 * mm, 1 * mm, 7 * mm), (PX + 0.17, front - 0.0198, PZ + PH - 0.04), M['seam']))

for o in parts:
    bpy.context.view_layer.objects.active = o
    for sel in bpy.context.selected_objects:
        sel.select_set(False)
    o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

body = c.join(parts, 'BenchFrame')
out = c.args()
c.export_glb(out[0])
print('exported', out[0], 'faces', len(body.data.polygons))
if len(out) > 1:
    c.preview(out[1], target=(0.6, -D / 2, 0.4), distance=3.5, angle=(-20, 20))
