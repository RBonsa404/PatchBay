"""The technician's desk in the technical room: a laminate top on a steel C-leg frame with its modesty panel and cable
tray, a three-drawer pedestal on castors, a 24-inch monitor on its stand (the picture itself is drawn by the game), a
keyboard and a mouse on its pad, and five lever-arch binders with their spine labels.

    blender --background --factory-startup --python art/blender/tech_desk.py -- <out.glb> [preview.png]

Centred, floor at z = 0, the seat side towards -Y (+Z in the game). 1.5 x 0.7 m, top at 0.74 m. The monitor's screen
face is at y = 0.1275, its centre 0.30 m above the top, 0.10 m right of the middle (seen from the seat).
"""
import math
import os
import sys

import bpy

sys.path.append(os.path.dirname(__file__))
import common as c  # noqa: E402

mm = 0.001
W, D, TOP = 1.5, 0.7, 0.74
c.reset()
M = {
    'laminate': c.material('laminate', '#c9b28f', 0.55),
    'edge': c.material('edge', '#3a3f47', 0.5),
    'frame': c.material('frame', '#2f3640', 0.45, 0.6),
    'pedestal': c.material('pedestal', '#94a3b8', 0.55, 0.3),
    'gap': c.material('gap', '#0d1117', 0.9),
    'chrome': c.material('chrome', '#d5dbe2', 0.22, 1.0),
    'plastic': c.material('plastic', '#1b1f26', 0.45),
    'key': c.material('key', '#262b33', 0.6),
    'pad': c.material('pad', '#0f172a', 0.9),
    'rubber': c.material('rubber', '#0a0b0d', 0.8),
    'label': c.material('label', '#f8fafc', 0.8),
    'ink': c.material('ink', '#0b1e3f', 0.6),
    'blue': c.material('blue', '#1d4ed8', 0.6),
    'yellow': c.material('yellow', '#fbbf24', 0.6),
    'navy': c.material('navy', '#0b1e3f', 0.6),
    'grey': c.material('grey', '#94a3b8', 0.6),
    'led': c.material('led', '#38bdf8', 0.3, emission='#38bdf8', strength=3),
}
parts = []


def cylinder(name, radius, depth, at, mat, vertices=16, rotate=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=at, rotation=rotate)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


# The top: laminate with a dark ABS edge band.
parts.append(c.box('top', (W - 4 * mm, D - 4 * mm, 0.025), (0, 0, TOP - 0.0125), M['laminate'], bevel=1 * mm))
for name, size, at in (
    ('band-front', (W, 2 * mm, 0.025), (0, -D / 2 + 1 * mm, TOP - 0.0125)),
    ('band-back', (W, 2 * mm, 0.025), (0, D / 2 - 1 * mm, TOP - 0.0125)),
    ('band-left', (2 * mm, D, 0.025), (-W / 2 + 1 * mm, 0, TOP - 0.0125)),
    ('band-right', (2 * mm, D, 0.025), (W / 2 - 1 * mm, 0, TOP - 0.0125)),
):
    parts.append(c.box(name, size, at, M['edge'], bevel=0.8 * mm))

# The frame: two C legs (upright, foot, arm under the top), a beam between them, a perforated modesty panel at the back.
for s in (-1, 1):
    x = s * (W / 2 - 0.06)
    parts.append(c.box(f'leg{s}', (0.06, 0.04, TOP - 0.06), (x, 0.22, (TOP - 0.06) / 2 + 0.03), M['frame'], bevel=3 * mm))
    parts.append(c.box(f'foot{s}', (0.06, D - 0.06, 0.03), (x, 0, 0.022), M['frame'], bevel=4 * mm))
    parts.append(c.box(f'arm{s}', (0.05, D - 0.08, 0.03), (x, 0, TOP - 0.04), M['frame'], bevel=3 * mm))
    for y in (-D / 2 + 0.05, D / 2 - 0.05):
        parts.append(cylinder(f'glide{s}{y}', 0.016, 0.012, (x, y, 0.006), M['rubber'], vertices=12))
parts.append(c.box('beam', (W - 0.16, 0.04, 0.05), (0, 0.22, TOP - 0.08), M['frame'], bevel=3 * mm))
parts.append(c.box('modesty', (W - 0.2, 0.012, 0.32), (0, D / 2 - 0.05, TOP - 0.24), M['frame'], bevel=2 * mm))
# The cable tray under the back of the top, with a power strip in it.
parts.append(c.box('tray', (0.8, 0.1, 0.004), (0.1, D / 2 - 0.12, TOP - 0.1), M['frame']))
parts.append(c.box('tray-lip', (0.8, 0.004, 0.05), (0.1, D / 2 - 0.17, TOP - 0.077), M['frame']))
parts.append(c.box('strip', (0.3, 0.05, 0.04), (0.1, D / 2 - 0.12, TOP - 0.078), M['plastic'], bevel=4 * mm))

# The pedestal under the left of the top (seen from the seat): three drawers, recessed grips, a lock, castors.
PX, PW, PD, PH = -0.48, 0.42, 0.56, 0.58
parts.append(c.box('ped', (PW, PD, PH - 0.05), (PX, 0.02, 0.05 + (PH - 0.05) / 2), M['pedestal'], bevel=3 * mm))
front = 0.02 - PD / 2
for i, (z0, h) in enumerate(((0.06, 0.25), (0.32, 0.12), (0.45, 0.12))):
    zc = z0 + h / 2
    parts.append(c.box(f'drawer{i}', (PW - 0.012, 0.016, h - 0.006), (PX, front - 0.008, zc), M['pedestal'], bevel=2 * mm))
    parts.append(c.box(f'grip{i}', (0.16, 0.02, 0.012), (PX, front - 0.008, zc + h / 2 - 0.022), M['gap'], bevel=1.5 * mm))
    parts.append(c.box(f'grip-lip{i}', (0.16, 0.012, 0.004), (PX, front - 0.018, zc + h / 2 - 0.03), M['chrome'], bevel=1 * mm))
parts.append(cylinder('ped-lock', 8 * mm, 0.01, (PX + PW / 2 - 0.04, front - 0.017, 0.535), M['chrome'], vertices=14, rotate=(math.pi / 2, 0, 0)))
for dx in (-1, 1):
    for dy in (-1, 1):
        parts.append(cylinder(f'castor{dx}{dy}', 0.022, 0.02, (PX + dx * (PW / 2 - 0.05), 0.02 + dy * (PD / 2 - 0.06), 0.024), M['rubber'], vertices=14, rotate=(0, math.pi / 2, 0)))
        parts.append(c.box(f'fork{dx}{dy}', (0.03, 0.03, 0.03), (PX + dx * (PW / 2 - 0.05), 0.02 + dy * (PD / 2 - 0.06), 0.04), M['frame'], bevel=3 * mm))

# The monitor: thin bezel, a chin with the brand dot and a power LED, a back shell, the stand's neck and foot.
MX, MY, MZ = 0.1, 0.14, TOP + 0.3
parts.append(c.box('monitor', (0.555, 0.025, 0.335), (MX, MY, MZ), M['plastic'], bevel=4 * mm))
parts.append(c.box('monitor-back', (0.36, 0.035, 0.22), (MX, MY + 0.025, MZ - 0.02), M['plastic'], bevel=10 * mm, segments=3))
parts.append(c.box('chin', (0.555, 0.026, 0.02), (MX, MY - 0.0005, MZ - 0.175), M['plastic'], bevel=3 * mm))
parts.append(c.box('power-led', (4 * mm, 1 * mm, 2 * mm), (MX + 0.24, MY - 0.0135, MZ - 0.176), M['led']))
parts.append(c.box('neck', (0.06, 0.025, 0.24), (MX, MY + 0.055, TOP + 0.13), M['frame'], bevel=6 * mm, segments=3))
parts.append(c.box('stand', (0.22, 0.17, 0.012), (MX, MY + 0.03, TOP + 0.006), M['frame'], bevel=5 * mm, segments=3))

# Keyboard: a slim deck and its keys in rows; mouse on a pad.
KX, KY = 0.1, -0.12
parts.append(c.box('keyboard', (0.42, 0.13, 0.016), (KX, KY, TOP + 0.008), M['plastic'], bevel=4 * mm))
for row in range(5):
    count = 15 if row < 4 else 5
    for k in range(count):
        if row == 4:
            w = 0.12 if k == 2 else 0.035
            x = KX - 0.15 + [0, 0.045, 0.13, 0.215, 0.26][k]
        else:
            w, x = 0.021, KX - 0.175 + k * 0.025 + row * 0.004
        parts.append(c.box(f'key{row}-{k}', (w, 0.019, 0.006), (x, KY + 0.045 - row * 0.023, TOP + 0.018), M['key'], bevel=1.5 * mm))
parts.append(c.box('mousepad', (0.22, 0.18, 0.003), (-0.2, KY, TOP + 0.0015), M['pad'], bevel=1 * mm))
bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=10, radius=1, location=(-0.17, KY, TOP + 0.003))
mouse = bpy.context.active_object
mouse.name = 'mouse'
mouse.scale = (0.03, 0.055, 0.02)
mouse.data.materials.append(M['plastic'])
parts.append(mouse)

# Five lever-arch binders standing at the back, their spines towards the seat, a label on each.
for i, (mat, text) in enumerate(((M['blue'], 'VLAN'), (M['yellow'], 'IP'), (M['navy'], 'BAIES'), (M['blue'], 'TP'), (M['grey'], 'FAI'))):
    x = -0.42 - i * 0.056
    parts.append(c.box(f'binder{i}', (0.05, 0.2, 0.28), (x, 0.2, TOP + 0.14), mat, bevel=3 * mm))
    parts.append(c.box(f'spine-label{i}', (0.036, 1 * mm, 0.09), (x, 0.0995, TOP + 0.17), M['label']))
    parts.append(cylinder(f'finger{i}', 9 * mm, 2 * mm, (x, 0.0995, TOP + 0.06), M['gap'], vertices=14, rotate=(math.pi / 2, 0, 0)))
    t = c.text(f'spine-text{i}', text, 0.012, (x, 0.0985, TOP + 0.17), M['ink'], resolution=3)
    t.rotation_euler = (math.pi / 2, math.pi / 2, 0)
    parts.append(t)

for o in parts:
    bpy.context.view_layer.objects.active = o
    for sel in bpy.context.selected_objects:
        sel.select_set(False)
    o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

body = c.join(parts, 'TechDesk')
out = c.args()
c.export_glb(out[0])
print('exported', out[0], 'faces', len(body.data.polygons))
if len(out) > 1:
    c.preview(out[1], target=(0, 0, 0.6), distance=3.4, angle=(-30, 22))
