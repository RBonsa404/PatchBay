"""The administration laptop of a mission: a 14-inch business laptop, dark grey aluminium, lid open at about 106
degrees, a full keyboard in its well, a glass touchpad, and on its front edge the two ports the missions use: the RJ45 of
its network card (with its flip-down jaw) and an RS232 serial port (a rugged model, chosen for the console cable).

    blender --background --factory-startup --python art/blender/laptop.py -- <out.glb> [preview.png]

Same footprint as the shape the game drew before (0.33 x 0.23 m, hinge 0.115 m behind the centre, lid tipped back by
0.28 rad). Markers: `port:FastEthernet0`, `led:FastEthernet0`, `port:RS232`, `tag` and
`screen` (centre and orientation of the picture the game draws, 0.30 x 0.19 m, facing the model's +Z).
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.append(os.path.dirname(__file__))
import common as c  # noqa: E402

mm = 0.001
W, D, T, LIFT = 0.33, 0.23, 0.016, 0.002
FRONT = -D / 2
c.reset()
M = {
    'alu': c.material('aluminium', '#9aa1ab', 0.38, 0.5),
    'deck': c.material('deck', '#868d97', 0.42, 0.45),
    'black': c.material('bezel', '#121418', 0.4),
    'keys': c.material('keys', '#1b1d21', 0.55),
    'well': c.material('well', '#0d0f12', 0.7),
    'pad': c.material('touchpad', '#2f343b', 0.18, 0.3),
    'glass': c.material('glass', '#05070a', 0.08),
    'hole': c.material('hole', '#050607', 0.9),
    'gold': c.material('gold', '#c9a13b', 0.3, 1.0),
    'steel': c.material('steel', '#9aa3ad', 0.3, 0.9),
    'rubber': c.material('rubber', '#0c0d0e', 0.8),
    'print': c.material('print', '#cbd5e1', 0.5),
    'led': c.material('led', '#9fd3ff', 0.3, emission='#7cc4ff', strength=6),
}
parts = []


def cylinder(name, radius, depth, at, mat, vertices=24, rotate=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=at, rotation=rotate)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


# ---- the base ----------------------------------------------------------------------------------------------------
ZC = LIFT + T / 2
TOP = LIFT + T
parts.append(c.box('base', (W, D, T), (0, 0, ZC), M['alu'], bevel=4 * mm, segments=3))
parts.append(c.box('deck', (W - 0.008, D - 0.012, 0.6 * mm), (0, 0.002, TOP - 0.1 * mm), M['deck'], bevel=3 * mm, segments=2))
# The keyboard in its well, 0.29 x 0.105 m, 0.02 m behind the centre.
KY = 0.02
parts.append(c.box('well', (0.292, 0.107, 0.8 * mm), (0, KY, TOP + 0.05 * mm), M['well']))
P = 0.0182
left = -0.145
for row in range(6):
    y = KY - 0.046 + row * P * 1.0
    small = row == 5  # the function row, half height
    h = (P * 0.55) if small else (P - 2.6 * mm)
    for k in range(15 if small else 14):
        if row == 0 and 3 <= k <= 9:
            continue
        x = left + k * (0.29 / 15 if small else P) + (0.003 if row in (2, 3) else 0)
        kw = (0.29 / 15 - 2.4 * mm) if small else (P - 2.6 * mm)
        if not small and k == 13 and row in (1, 2, 3, 4):
            kw = P + 0.004  # enter, backspace and shift run to the edge
        parts.append(c.box(f'key{row}-{k}', (kw, h, 1.2 * mm), (x + kw / 2 + 1.3 * mm, y - (0.004 if small else 0), TOP + 0.7 * mm), M['keys'], bevel=0.5 * mm, segments=1))
    if row == 0:
        parts.append(c.box('space', (7 * P - 2.6 * mm, P - 2.6 * mm, 1.2 * mm), (left + 3 * P + 3.5 * P + 1.3 * mm, y, TOP + 0.7 * mm), M['keys'], bevel=0.5 * mm, segments=1))
# The glass touchpad, the speaker grilles either side of the keyboard, the power button with its light.
parts.append(c.box('touchpad', (0.1, 0.06, 0.4 * mm), (0, -0.075, TOP + 0.15 * mm), M['pad'], bevel=2 * mm))
for s in (-1, 1):
    for i in range(3):
        parts.append(c.box(f'grille{s}{i}', (0.8 * mm, 0.08, 0.3 * mm), (s * (0.152 + i * 1.8 * mm), KY, TOP + 0.05 * mm), M['well']))
parts.append(c.box('power', (8 * mm, 5 * mm, 0.8 * mm), (0.135, KY + 0.062, TOP + 0.2 * mm), M['keys'], bevel=1 * mm))
parts.append(c.box('power-led', (2 * mm, 1 * mm, 0.4 * mm), (0.135, KY + 0.062 - 3.5 * mm, TOP + 0.2 * mm), M['led']))
# Front edge: the RJ45 with its jaw, the RS232 port, the charging light.
NX, SX_ = 0.05, 0.1
shell = c.box('rj45-shell', (16 * mm, 4 * mm, 12.5 * mm), (NX, FRONT + 1.2 * mm, ZC), M['alu'], bevel=0.4 * mm)
c.cut(shell, [c.box('rj45-mouth', (11.7 * mm, 6 * mm, 10 * mm), (NX, FRONT + 0.8 * mm, ZC - 0.4 * mm), M['hole'])])
parts.append(shell)
parts.append(c.box('rj45-back', (11.7 * mm, 1 * mm, 10 * mm), (NX, FRONT + 4 * mm, ZC - 0.4 * mm), M['hole']))
parts.append(c.box('rj45-jaw', (9 * mm, 1.2 * mm, 2 * mm), (NX, FRONT - 0.4 * mm, ZC - 6.3 * mm), M['black'], bevel=0.4 * mm))
for k in range(8):
    parts.append(c.box(f'rj45-pin{k}', (0.5 * mm, 3 * mm, 0.5 * mm), (NX - 4.4 * mm + k * 1.27 * mm, FRONT + 2.5 * mm, ZC + 3.6 * mm), M['gold']))
parts.append(c.box('db9-surround', (31 * mm, 0.8 * mm, 12 * mm), (SX_, FRONT - 0.2 * mm, ZC), M['steel'], bevel=1.5 * mm))
db9 = c.box('db9-shell', (17 * mm, 4 * mm, 7.5 * mm), (SX_, FRONT - 1.6 * mm, ZC), M['steel'], bevel=2 * mm)
c.cut(db9, [c.box('db9-mouth', (15 * mm, 6 * mm, 5.8 * mm), (SX_, FRONT - 2 * mm, ZC), M['hole'], bevel=1.5 * mm)])
parts.append(db9)
for k in range(5):
    parts.append(c.box(f'db9-a{k}', (1 * mm, 3 * mm, 1 * mm), (SX_ - 5.5 * mm + k * 2.75 * mm, FRONT - 1 * mm, ZC + 1.3 * mm), M['gold']))
for k in range(4):
    parts.append(c.box(f'db9-b{k}', (1 * mm, 3 * mm, 1 * mm), (SX_ - 4.1 * mm + k * 2.75 * mm, FRONT - 1 * mm, ZC - 1.3 * mm), M['gold']))
parts.append(c.box('charge-led', (3 * mm, 0.6 * mm, 1.2 * mm), (-0.13, FRONT - 0.2 * mm, ZC), M['led']))
for dx in (-0.13, 0.13):
    parts.append(c.box(f'foot{dx}', (0.06, 6 * mm, LIFT + 0.5 * mm), (dx, FRONT + 0.02, (LIFT + 0.5 * mm) / 2), M['rubber'], bevel=1 * mm))
    parts.append(c.box(f'foot-back{dx}', (0.06, 6 * mm, LIFT + 0.5 * mm), (dx, D / 2 - 0.02, (LIFT + 0.5 * mm) / 2), M['rubber'], bevel=1 * mm))

# ---- the lid, tipped back about the hinge --------------------------------------------------------------------------
HINGE = Vector((0, D / 2, LIFT + 0.018))
TILT = -0.28


def on_lid(local):
    """A point given in the lid's frame (hinge at the origin, lid standing up along +Z) put in the model's frame."""
    x, y, z = local
    return HINGE + Vector((x, y * math.cos(TILT) - z * math.sin(TILT), y * math.sin(TILT) + z * math.cos(TILT)))


lid = []
lid.append(c.box('lid', (W, 0.008, 0.22), on_lid((0, 0, 0.11)), M['alu'], bevel=3 * mm, segments=3))
lid.append(c.box('bezel', (W - 0.006, 1 * mm, 0.214), on_lid((0, -0.0043, 0.11)), M['black'], bevel=2 * mm))
lid.append(c.box('glass', (0.302, 0.6 * mm, 0.192), on_lid((0, -0.005, 0.112)), M['glass']))
lid.append(c.box('webcam', (2.5 * mm, 0.6 * mm, 2.5 * mm), on_lid((0, -0.005, 0.2135)), M['well'], bevel=1 * mm))
for o in lid:
    o.rotation_euler = (TILT, 0, 0)
parts.extend(lid)
parts.append(cylinder('hinge', 0.0075, W - 0.06, HINGE, M['black'], 24, (0, math.pi / 2, 0)))

for o in parts:
    bpy.context.view_layer.objects.active = o
    for s in bpy.context.selected_objects:
        s.select_set(False)
    o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

body = c.join(parts, 'Laptop')
c.attach(c.marker('port:FastEthernet0', (NX, FRONT - 3 * mm, ZC)), body)
c.attach(c.marker('led:FastEthernet0', (NX - 0.012, FRONT - 0.6 * mm, ZC + 0.004)), body)
c.attach(c.marker('port:RS232', (SX_, FRONT - 4 * mm, ZC)), body)
c.attach(c.marker('tag', (-0.06, FRONT - 0.5 * mm, ZC)), body)
screen = c.marker('screen', tuple(on_lid((0, -0.0075, 0.112))))
screen.rotation_euler = (TILT, 0, 0)
c.attach(screen, body)
out = c.args()
c.export_glb(out[0])
print('exported', out[0], 'faces', len(body.data.polygons))
if len(out) > 1:
    c.preview(out[1], target=(0.02, -0.02, 0.07), distance=0.9, angle=(-25, 24))
