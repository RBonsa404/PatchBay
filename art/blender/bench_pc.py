"""The PC a mission puts on the bench: a mid tower on the right, its front facing the player with the network card's
RJ45 socket and the RS232 serial port brought out on a brushed I/O plate at the bottom (a teaching-lab tower: the
cables are plugged in front, where the students can see them); a thin-bezel 22-inch screen on its stand on the left,
a compact keyboard and a mouse in front.

    blender --background --factory-startup --python art/blender/bench_pc.py -- <out.glb> [preview.png]

Same footprint as the shape the game drew before (tower 0.17 x 0.34 m at x = 0.2, screen centred at x = -0.12), so
the levels' positions do not move. Markers: `port:FastEthernet0`, `led:FastEthernet0`, `port:RS232`, `tag` (the
hostname, on the tower's front) and `screen` (the centre of the picture the game draws, 0.44 x 0.262 m, facing +Z).
"""
import math
import os
import sys

import bpy

sys.path.append(os.path.dirname(__file__))
import common as c  # noqa: E402

mm = 0.001
c.reset()
M = {
    'case': c.material('case', '#2a2e35', 0.45, 0.35),
    'bezel': c.material('bezel', '#15181d', 0.38),
    'plate': c.material('io-plate', '#b9c0c8', 0.32, 0.85),
    'black': c.material('plastic', '#17191c', 0.42),
    'keys': c.material('keys', '#2b2e33', 0.55),
    'rubber': c.material('rubber', '#0c0d0e', 0.8),
    'glass': c.material('glass', '#05070a', 0.08),
    'hole': c.material('hole', '#050607', 0.9),
    'gold': c.material('gold', '#c9a13b', 0.3, 1.0),
    'steel': c.material('steel', '#9aa3ad', 0.3, 0.9),
    'print': c.material('print', '#e2e8f0', 0.5),
    'cyan': c.material('accent', '#38bdf8', 0.3, emission='#38bdf8', strength=5),
    'power': c.material('power-led', '#9fd3ff', 0.3, emission='#7cc4ff', strength=6),
}
parts = []


def cylinder(name, radius, depth, at, mat, vertices=24, rotate=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=at, rotation=rotate)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


# ---- the tower ---------------------------------------------------------------------------------------------------
TX, TW, TD, TH, FOOT = 0.2, 0.17, 0.34, 0.36, 0.008
parts.append(c.box('tower', (TW, TD, TH), (TX, 0, FOOT + TH / 2), M['case'], bevel=5 * mm, segments=3))
FRONT = -TD / 2 - 6 * mm  # the face of the plastic front
parts.append(c.box('bezel', (TW - 4 * mm, 7 * mm, TH - 6 * mm), (TX, -TD / 2 - 2.5 * mm, FOOT + TH / 2), M['bezel'], bevel=3 * mm))
# The club's cyan light strip down the left edge of the front.
parts.append(c.box('strip', (3 * mm, 1 * mm, 0.28), (TX - 0.07, FRONT - 0.4 * mm, FOOT + 0.2), M['cyan']))
# A slim optical drive with its eject button, two USB ports and the audio jacks, the power button and its ring.
parts.append(c.box('drive', (0.13, 1.2 * mm, 0.02), (TX + 0.01, FRONT - 0.5 * mm, FOOT + 0.322), M['black'], bevel=0.5 * mm))
parts.append(c.box('drive-slot', (0.1, 1.4 * mm, 1.5 * mm), (TX + 0.005, FRONT - 0.6 * mm, FOOT + 0.322), M['hole']))
parts.append(c.box('eject', (8 * mm, 1.6 * mm, 3 * mm), (TX + 0.06, FRONT - 0.6 * mm, FOOT + 0.322), M['bezel'], bevel=0.6 * mm))
for i, x in enumerate((-0.012, 0.012)):
    parts.append(c.box(f'usb{i}', (13 * mm, 2 * mm, 5.5 * mm), (TX + x, FRONT - 0.3 * mm, FOOT + 0.28), M['hole']))
    parts.append(c.box(f'usb-tongue{i}', (11 * mm, 2.2 * mm, 1.8 * mm), (TX + x, FRONT - 0.3 * mm, FOOT + 0.2815), M['steel']))
for i, x in enumerate((0.04, 0.054)):
    parts.append(cylinder(f'jack{i}', 2.6 * mm, 2 * mm, (TX + x, FRONT - 0.2 * mm, FOOT + 0.28), M['hole'], 16, (math.pi / 2, 0, 0)))
parts.append(cylinder('power-ring', 0.0105, 1.2 * mm, (TX + 0.01, FRONT - 0.6 * mm, FOOT + 0.235), M['power'], 32, (math.pi / 2, 0, 0)))
parts.append(cylinder('power-button', 0.0085, 2.4 * mm, (TX + 0.01, FRONT - 1.2 * mm, FOOT + 0.235), M['bezel'], 32, (math.pi / 2, 0, 0)))
# Breathing slots across the middle of the front.
for i in range(7):
    parts.append(c.box(f'slot{i}', (0.11, 1.2 * mm, 2.2 * mm), (TX + 0.01, FRONT - 0.2 * mm, FOOT + 0.15 + i * 0.008), M['hole']))

# The brushed I/O plate at the bottom: the RJ45 of the network card above, the RS232 serial port under it.
PZ = FOOT + 0.07
parts.append(c.box('io-plate', (0.12, 1.2 * mm, 0.1), (TX, FRONT - 0.5 * mm, PZ), M['plate'], bevel=1 * mm))
for sx in (-0.052, 0.052):
    for sz in (-0.042, 0.042):
        parts.append(cylinder(f'plate-screw{sx}{sz}', 2 * mm, 1 * mm, (TX + sx, FRONT - 1.4 * mm, PZ + sz), M['steel'], 12, (math.pi / 2, 0, 0)))
NZ = FOOT + 0.09 - 0.008  # the RJ45 (the plug's centre)
shell = c.box('rj45-shell', (16 * mm, 6 * mm, 14 * mm), (TX, FRONT - 3 * mm, NZ), M['steel'], bevel=0.6 * mm)
c.cut(shell, [c.box('rj45-mouth', (11.7 * mm, 8 * mm, 10 * mm), (TX, FRONT - 3.5 * mm, NZ - 0.5 * mm), M['hole'])])
parts.append(shell)
parts.append(c.box('rj45-back', (11.7 * mm, 1 * mm, 10 * mm), (TX, FRONT + 1.5 * mm, NZ - 0.5 * mm), M['hole']))
for k in range(8):
    parts.append(c.box(f'rj45-pin{k}', (0.5 * mm, 4 * mm, 0.5 * mm), (TX - 4.4 * mm + k * 1.27 * mm, FRONT - 1 * mm, NZ + 3.6 * mm), M['gold']))
parts.append(c.text('lan', 'LAN', 0.0055, (TX, FRONT - 1.2 * mm, NZ - 0.0115), M['hole']))
DZ = FOOT + 0.045 - 0.008  # the DB-9 (male, as on a PC)
parts.append(c.box('db9-surround', (31 * mm, 1.2 * mm, 12.5 * mm), (TX, FRONT - 1.4 * mm, DZ), M['steel'], bevel=1.5 * mm))
db9 = c.box('db9-shell', (17 * mm, 6 * mm, 8 * mm), (TX, FRONT - 4 * mm, DZ), M['steel'], bevel=2 * mm)
c.cut(db9, [c.box('db9-mouth', (15 * mm, 8 * mm, 6.2 * mm), (TX, FRONT - 4.5 * mm, DZ), M['hole'], bevel=1.5 * mm)])
parts.append(db9)
for k in range(5):
    parts.append(c.box(f'db9-pin-a{k}', (1 * mm, 4 * mm, 1 * mm), (TX - 5.5 * mm + k * 2.75 * mm, FRONT - 3 * mm, DZ + 1.4 * mm), M['gold']))
for k in range(4):
    parts.append(c.box(f'db9-pin-b{k}', (1 * mm, 4 * mm, 1 * mm), (TX - 4.1 * mm + k * 2.75 * mm, FRONT - 3 * mm, DZ - 1.4 * mm), M['gold']))
for s in (-1, 1):
    parts.append(cylinder(f'db9-post{s}', 2.4 * mm, 5 * mm, (TX + s * 12.5 * mm, FRONT - 3.5 * mm, DZ), M['steel'], 6, (math.pi / 2, 0, 0)))
parts.append(c.text('rs232', 'RS232', 0.0055, (TX, FRONT - 1.2 * mm, DZ - 0.0105), M['hole']))
# Ventilation down the right side, rubber feet.
for i in range(9):
    parts.append(c.box(f'vent{i}', (1 * mm, 0.22, 3 * mm), (TX + TW / 2 + 0.2 * mm, 0.02, FOOT + 0.24 + i * 0.01), M['hole']))
for dx in (-0.06, 0.06):
    for dy in (-0.14, 0.14):
        parts.append(cylinder(f'foot{dx}{dy}', 0.012, FOOT, (TX + dx, dy, FOOT / 2), M['rubber'], 12))

# ---- the screen --------------------------------------------------------------------------------------------------
SX, SY, SZ = -0.12, 0.02, 0.275
parts.append(c.box('monitor', (0.45, 0.016, 0.275), (SX, SY, SZ), M['black'], bevel=3 * mm, segments=3))
parts.append(c.box('glass', (0.442, 1 * mm, 0.264), (SX, SY - 0.0082, SZ + 0.003), M['glass']))
parts.append(c.box('chin', (0.45, 0.017, 0.012), (SX, SY - 0.0003, SZ - 0.1315), M['bezel'], bevel=2 * mm))
parts.append(c.box('monitor-led', (4 * mm, 1 * mm, 1.6 * mm), (SX + 0.205, SY - 0.0092, SZ - 0.1315), M['power']))
parts.append(c.box('hump', (0.26, 0.03, 0.17), (SX, SY + 0.02, SZ - 0.01), M['black'], bevel=10 * mm, segments=3))
parts.append(c.box('neck', (0.04, 0.02, 0.17), (SX, SY + 0.03, 0.1), M['bezel'], bevel=4 * mm))
parts.append(c.box('base', (0.17, 0.12, 0.008), (SX, 0.0, 0.004), M['bezel'], bevel=4 * mm, segments=3))
parts.append(c.box('screen-cable', (6 * mm, 6 * mm, 0.17), (SX + 0.03, SY + 0.05, 0.09), M['rubber'], bevel=2.5 * mm))

# ---- keyboard and mouse ------------------------------------------------------------------------------------------
KX, KY, KZ = -0.12, -0.16, 0.0
parts.append(c.box('keyboard', (0.34, 0.115, 0.014), (KX, KY, KZ + 0.007), M['black'], bevel=4 * mm, segments=3))
P = 0.0185
left = KX - 0.163
for row in range(5):
    y = KY - 0.04 + row * P * 1.02
    for k in range(14):
        if row == 0 and 3 <= k <= 9:
            continue
        x = left + k * P + (0.003 if row in (1, 2) else 0)
        parts.append(c.box(f'key{row}-{k}', (P - 3 * mm, P - 3 * mm, 5 * mm), (x + P / 2, y, KZ + 0.0155), M['keys'], bevel=0.8 * mm, segments=1))
    if row == 0:
        parts.append(c.box('space', (7 * P - 3 * mm, P - 3 * mm, 5 * mm), (left + 3 * P + 3.5 * P, y, KZ + 0.0155), M['keys'], bevel=0.8 * mm, segments=1))
for (ax, row) in ((0, 0), (1, 0), (2, 0), (1, 1)):
    parts.append(c.box(f'arrow{ax}{row}', (P - 3 * mm, P - 3 * mm, 5 * mm), (left + 14.4 * P + ax * P + P / 2, KY - 0.04 + row * P * 1.02, KZ + 0.0155), M['keys'], bevel=0.8 * mm, segments=1))
mouse = c.box('mouse', (0.058, 0.1, 0.03), (0.085, -0.23, 0.016), M['black'], bevel=13 * mm, segments=4)
parts.append(mouse)
parts.append(c.box('mouse-split', (0.8 * mm, 0.04, 2 * mm), (0.085, -0.258, 0.03), M['hole']))
parts.append(cylinder('wheel', 4 * mm, 3 * mm, (0.085, -0.251, 0.03), M['rubber'], 16, (0, math.pi / 2, 0)))

# Rotated parts must be applied before joining.
for o in parts:
    bpy.context.view_layer.objects.active = o
    for s in bpy.context.selected_objects:
        s.select_set(False)
    o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

body = c.join(parts, 'BenchPC')
c.attach(c.marker('port:FastEthernet0', (TX, FRONT - 4 * mm, NZ)), body)
c.attach(c.marker('led:FastEthernet0', (TX + 0.0135, FRONT - 1.4 * mm, NZ + 0.0075)), body)
c.attach(c.marker('port:RS232', (TX, FRONT - 4 * mm, DZ)), body)
c.attach(c.marker('tag', (TX + 0.01, FRONT - 0.2 * mm, FOOT + 0.3)), body)
c.attach(c.marker('screen', (SX, SY - 0.0115, SZ + 0.003)), body)
out = c.args()
c.export_glb(out[0])
print('exported', out[0], 'faces', len(body.data.polygons))
if len(out) > 1:
    c.preview(out[1], target=(0.04, -0.05, 0.16), distance=1.5, angle=(-28, 16))
