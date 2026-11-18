"""The steel shelving of the technical room's stock, against the left wall: boltless shelving in galvanised and painted
steel, perforated angle posts on plastic feet, five shelves on folded beams, X bracing at the back; on it the stock in
straight rows (labelled crates, two reels of cable, the spare switches still in their boxes).

    blender --background --factory-startup --python art/blender/shelving.py -- <out.glb> [preview.png]

Centred, floor at z = 0, front at y = -D/2 (+Z in the game). 1.94 x 0.46 m, 2.10 m high; the shelves' tops at the
heights the game used (0.1525, 0.6325, 1.1125, 1.5925, 2.0325 m).
"""
import math
import os
import sys

sys.path.append(os.path.dirname(__file__))
import common as c  # noqa: E402
import storage as s  # noqa: E402

import bpy  # noqa: E402

mm = 0.001
SPAN, D, H = 1.9, 0.46, 2.1
POST = 0.035
LEVELS = [0.14, 0.62, 1.1, 1.58, 2.02]
c.reset()
S = s.materials()
M = {
    'post': c.material('post', '#8b97a8', 0.5, 0.55),
    'deck': c.material('deck', '#b9c1ca', 0.42, 0.75),
    'beam': c.material('beam', '#7d8899', 0.48, 0.55),
    'slot': c.material('slot', '#0b0d10', 0.9),
    'foot': c.material('foot', '#111316', 0.7),
    'blue': c.material('cable-blue', '#2563eb', 0.5),
    'orange': c.material('cable-orange', '#f59e0b', 0.5),
}
parts = []
XS = (-SPAN / 2, 0.0, SPAN / 2)
YP = D / 2 - POST / 2  # the posts' centres across the depth
T = 2.5 * mm

# Angle posts: an L at each end, a T in the middle, keyhole slots punched every 5 cm on their outer faces.
for x in XS:
    end = 0 if x == 0 else (1 if x > 0 else -1)
    for sy in (-1, 1):
        y = sy * YP
        parts.append(c.box(f'post-face{x}{sy}', (POST, T, H), (x, y + sy * (POST / 2 - T / 2), H / 2), M['post'], bevel=0.6 * mm))
        flange = [end] if end else [0]
        for fx in flange:
            parts.append(c.box(f'post-flange{x}{sy}{fx}', (T, POST, H), (x + fx * (POST / 2 - T / 2) * (1 if end else 0), y, H / 2), M['post'], bevel=0.6 * mm))
        parts.append(c.box(f'foot{x}{sy}', (POST + 6 * mm, POST + 6 * mm, 0.014), (x, y, 0.007), M['foot'], bevel=2 * mm))
        parts.append(c.box(f'cap{x}{sy}', (POST + 2 * mm, POST + 2 * mm, 6 * mm), (x, y, H + 3 * mm), M['foot'], bevel=1.5 * mm))
        for k in range(40):
            z = 0.07 + k * 0.05
            if sy < 0:
                parts.append(c.box(f'slot-f{x}{k}', (6 * mm, 1 * mm, 16 * mm), (x, y - POST / 2 - 0.3 * mm, z), M['slot']))
            if end:
                parts.append(c.box(f'slot-s{x}{sy}{k}', (1 * mm, 6 * mm, 16 * mm), (x + end * (POST / 2 + 0.3 * mm), y, z), M['slot']))

# The shelves: galvanised decks on beams folded into a Z, a rivet plate where each beam hooks into a post.
for level in LEVELS:
    top = level + 0.0125
    for bay in (-1, 1):
        cx = bay * SPAN / 4
        length = SPAN / 2 - POST
        parts.append(c.box(f'deck{level}{bay}', (length, D - POST - 4 * mm, 1.5 * mm), (cx, 0, top - 0.75 * mm), M['deck']))
        for sy in (-1, 1):
            y = sy * (YP - 2 * mm)
            parts.append(c.box(f'beam{level}{bay}{sy}', (length, 1.5 * mm, 0.04), (cx, y + sy * POST / 2, top - 0.02), M['beam'], bevel=0.5 * mm))
            parts.append(c.box(f'return{level}{bay}{sy}', (length, 0.016, 1.5 * mm), (cx, y + sy * (POST / 2 - 0.008), top - 0.0395), M['beam']))
            for ex in (-1, 1):
                parts.append(c.box(f'rivet{level}{bay}{sy}{ex}', (0.014, 2 * mm, 0.034), (cx + ex * (length / 2 - 0.007), y + sy * (POST / 2 + 0.7 * mm), top - 0.02), M['post'], bevel=0.6 * mm))
    for x in XS:
        parts.append(c.box(f'side{level}{x}', (1.5 * mm, D - 2 * POST, 0.03), (x, 0, top - 0.015), M['beam']))

# X bracing in the back of each bay.
for bay in (-1, 1):
    x0, x1 = bay * 0.03, bay * (SPAN / 2 - 0.03)
    z0, z1 = 0.16, 2.0
    length = math.hypot(x1 - x0, z1 - z0)
    for flip in (1, -1):
        strap = c.box(f'brace{bay}{flip}', (length, 1.5 * mm, 0.022), ((x0 + x1) / 2, D / 2 - 1 * mm, (z0 + z1) / 2), M['beam'])
        strap.rotation_euler = (0, -flip * math.atan2(z1 - z0, abs(x1 - x0)) * (1 if bay > 0 else -1), 0)
        parts.append(strap)

# The stock, two crates to a bay, clear of the middle post (seen from the room: right to left).
on = [lv + 0.0125 for lv in LEVELS]
ROWS = [0.705, 0.24, -0.24, -0.705]
STOCK = {
    0: ['RJ45 CAT6', 'PATCH 1 m', 'PATCH 2 m', 'PATCH 3 m'],
    2: ['CONSOLE', 'SÉRIE V.35', 'SFP', 'FIBRE LC'],
    3: ['ÉTIQUETTES', 'COLLIERS', 'VIS DE BAIE', 'VELCRO'],
}
for level, labels in STOCK.items():
    for x, label in zip(ROWS, labels):
        s.crate(parts, (x, -0.02, on[level]), label, w=0.42)
s.reel(parts, (ROWS[0], 0, on[1]), M['blue'])
s.reel(parts, (ROWS[1], 0, on[1]), M['orange'])
for i, turn in enumerate((0.0, 0.025, -0.015)):
    s.carton(parts, ((ROWS[2] + ROWS[3]) / 2 + (0.006 if i == 1 else 0), -0.03, on[1] + i * 0.101), ['SWITCH 24 PORTS', 'RÉSERVE'], h=0.1, turn=turn, tape_on_top=i == 2)

for o in parts:
    bpy.context.view_layer.objects.active = o
    for sel in bpy.context.selected_objects:
        sel.select_set(False)
    o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

body = c.join(parts, 'Shelving')
out = c.args()
c.export_glb(out[0])
print('exported', out[0], 'faces', len(body.data.polygons))
if len(out) > 1:
    c.preview(out[1], target=(0, -D / 2, 1.05), distance=4.4, angle=(-24, 8))
