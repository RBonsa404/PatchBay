"""A student workstation of a network teaching lab, after the photos of real labs (art/refs/photos/network-lab): a white
laminate desk on a grey steel frame with T feet, a modesty panel and a cable tray at the back, a grommet for the cables;
a 22-inch flat screen on its stand, a full keyboard, a mouse on its pad, a mini tower on the floor.

    blender --background --factory-startup --python art/blender/workstation.py -- <out.glb> [preview.png]

The student sits on the front (-Y, +Z in the game). The game draws the picture on the screen itself, as a plane just in
front of the glass: 0.47 x 0.30 m, centred 1.02 m above the floor, 0.187 m behind the desk's centre.
"""
import math
import os
import sys

import bpy

sys.path.append(os.path.dirname(__file__))
import common as c  # noqa: E402

W, D = 1.0, 0.8          # desk top, metres
TOP = 0.755              # height of the desk's surface
T = 0.025                # thickness of the top
mm = 0.001

c.reset()
M = {
    'top': c.material('laminate', '#e7e9ec', 0.5),
    'edge': c.material('edge', '#9aa2ab', 0.45),
    'steel': c.material('frame', '#8b939c', 0.38, 0.65),
    'panel': c.material('panel', '#b4bbc3', 0.5, 0.4),
    'black': c.material('plastic', '#17191c', 0.42),
    'case': c.material('case', '#202327', 0.5, 0.15),
    'keys': c.material('keys', '#2b2e33', 0.55),
    'rubber': c.material('rubber', '#0c0d0e', 0.8),
    'pad': c.material('pad', '#2c3440', 0.9),
    'glass': c.material('glass', '#05070a', 0.08),
    'led': c.material('led', '#9fd3ff', 0.3, emission='#7cc4ff', strength=6.0),
    'port': c.material('port', '#060708', 0.85),
}
parts = []


def cylinder(name, radius, depth, at, mat, vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=at)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


# The desk top, with its edge banding and a grommet at the back right for the screen's and the network's cables.
top = c.box('top', (W, D, T), (0, 0, TOP - T / 2), M['top'], bevel=2 * mm)
parts.append(top)
for s in (-1, 1):
    parts.append(c.box(f'band-y{s}', (W + 1 * mm, 1.5 * mm, T - 2 * mm), (0, s * (D / 2 + 0.2 * mm), TOP - T / 2), M['edge']))
    parts.append(c.box(f'band-x{s}', (1.5 * mm, D + 1 * mm, T - 2 * mm), (s * (W / 2 + 0.2 * mm), 0, TOP - T / 2), M['edge']))
parts.append(cylinder('grommet', 0.032, 0.004, (0.36, 0.3, TOP + 1 * mm), M['black']))
parts.append(cylinder('grommet-hole', 0.024, 0.002, (0.36, 0.3, TOP + 3 * mm), M['port']))

# The steel frame: a post and a T foot each side, a rail under the top, a beam and a modesty panel at the back.
for s in (-1, 1):
    x = s * (W / 2 - 0.05)
    parts.append(c.box(f'post{s}', (0.06, 0.04, TOP - T - 0.05), (x, 0.05, (TOP - T + 0.05) / 2), M['steel'], bevel=3 * mm))
    parts.append(c.box(f'foot{s}', (0.06, D - 0.06, 0.045), (x, 0, 0.032), M['steel'], bevel=6 * mm, segments=3))
    parts.append(c.box(f'rail{s}', (0.04, D - 0.1, 0.03), (x, 0, TOP - T - 0.015), M['steel'], bevel=2 * mm))
    for y in (-(D / 2 - 0.06), D / 2 - 0.06):
        parts.append(cylinder(f'leveler{s}{y}', 0.016, 0.012, (x, y, 0.006), M['rubber'], 16))
parts.append(c.box('beam', (W - 0.16, 0.03, 0.05), (0, 0.05, TOP - T - 0.05), M['steel'], bevel=2 * mm))
parts.append(c.box('modesty', (W - 0.16, 0.01, 0.32), (0, D / 2 - 0.07, TOP - T - 0.2), M['panel'], bevel=1 * mm))
# The cable tray hanging under the back of the top, a couple of cables lying in it.
parts.append(c.box('tray', (W - 0.2, 0.13, 2 * mm), (0, D / 2 - 0.16, TOP - T - 0.13), M['steel']))
parts.append(c.box('tray-lip', (W - 0.2, 2 * mm, 0.06), (0, D / 2 - 0.225, TOP - T - 0.1), M['steel']))
for i, (colour, dy) in enumerate((('#1d4ed8', -0.02), ('#111111', 0.02))):
    cable = c.material(f'cable{i}', colour, 0.45)
    parts.append(c.box(f'tray-cable{i}', (W - 0.24, 6 * mm, 6 * mm), (0, D / 2 - 0.16 + dy, TOP - T - 0.126), cable, bevel=2.5 * mm))

# The screen: a thin panel with a narrow bezel, its back hump, a neck and a base plate, a small power light.
SY, SZ = 0.202, 1.02
parts.append(c.box('screen', (0.51, 0.022, 0.33), (0, SY, SZ), M['black'], bevel=4 * mm, segments=3))
parts.append(c.box('glass', (0.474, 1 * mm, 0.302), (0, SY - 0.0115, SZ + 0.006), M['glass']))
parts.append(c.box('hump', (0.3, 0.04, 0.2), (0, SY + 0.025, SZ - 0.01), M['black'], bevel=12 * mm, segments=3))
parts.append(c.box('neck', (0.06, 0.025, 0.2), (0, SY + 0.05, TOP + 0.1), M['black'], bevel=5 * mm))
parts.append(c.box('base', (0.23, 0.17, 0.012), (0, SY + 0.03, TOP + 0.006), M['black'], bevel=5 * mm, segments=3))
parts.append(c.box('power', (5 * mm, 1 * mm, 3 * mm), (0.225, SY - 0.0115, SZ - 0.155), M['led']))
parts.append(c.box('screen-cable', (7 * mm, 7 * mm, 0.17), (0.04, SY + 0.07, TOP + 0.09), M['rubber'], bevel=3 * mm))

# A full keyboard: its body and, row by row, the keys (a block of letters, the arrows, the numeric pad).
KY, KZ = -0.12, TOP + 0.011
parts.append(c.box('keyboard', (0.44, 0.14, 0.018), (0, KY, KZ - 0.002), M['black'], bevel=4 * mm, segments=3))
P = 0.019
for row in range(5):
    y = KY - 0.04 + row * P * 1.02 - 0.002
    keys = 14 if row else 13
    for k in range(keys):
        if row == 0 and 3 <= k <= 8:
            continue  # the space bar
        x = -0.205 + k * P + (0.004 if row in (1, 2) else 0)
        parts.append(c.box(f'key{row}-{k}', (P - 3 * mm, P - 3 * mm, 6 * mm), (x + P / 2, y, KZ + 0.008), M['keys']))
    if row == 0:
        parts.append(c.box('space', (6 * P - 3 * mm, P - 3 * mm, 6 * mm), (-0.205 + 3 * P + 3 * P, y, KZ + 0.008), M['keys']))
    for k in range(4):
        if row == 0 and k == 1:
            continue
        w = 2 * P if (row == 0 and k == 0) else P
        x = 0.085 + k * P + (P / 2 if (row == 0 and k == 0) else 0)
        parts.append(c.box(f'pad{row}-{k}', (w - 3 * mm, P - 3 * mm, 6 * mm), (x + P / 2 + 0.05, y, KZ + 0.008), M['keys']))
# The arrows between the letters and the numeric pad.
for (ax, row) in ((0, 0), (1, 0), (2, 0), (1, 1)):
    parts.append(c.box(f'arrow{ax}{row}', (P - 3 * mm, P - 3 * mm, 6 * mm), (0.078 + ax * P, KY - 0.04 + row * P * 1.02 - 0.002, KZ + 0.008), M['keys']))
parts.append(c.box('led-num', (3 * mm, 1.5 * mm, 1 * mm), (0.19, KY + 0.06, KZ + 0.007), M['led']))

# The mouse on its pad, right of the keyboard.
parts.append(c.box('mousepad', (0.22, 0.18, 3 * mm), (0.36, KY + 0.01, TOP + 1.5 * mm), M['pad'], bevel=1 * mm))
mouse = c.box('mouse', (0.062, 0.105, 0.032), (0.36, KY, TOP + 0.019), M['black'], bevel=14 * mm, segments=4)
parts.append(mouse)

# The mini tower on the floor under the left of the desk, its front facing the student: a drive bay, two USB ports,
# the power button with its light, vents at the top of the side.
TX, TY, TH = -0.28, 0.12, 0.38
parts.append(c.box('tower', (0.17, 0.36, TH), (TX, TY, 0.012 + TH / 2), M['case'], bevel=5 * mm, segments=3))
front = TY - 0.18
parts.append(c.box('bezel', (0.16, 6 * mm, TH - 0.012), (TX, front - 2 * mm, 0.012 + TH / 2), M['black'], bevel=3 * mm))
parts.append(c.box('bay', (0.13, 1 * mm, 0.045), (TX, front - 5.2 * mm, 0.33), M['case']))
parts.append(c.box('bay-slot', (0.1, 1 * mm, 2 * mm), (TX, front - 5.5 * mm, 0.33), M['port']))
for i in (-1, 1):
    parts.append(c.box(f'usb{i}', (13 * mm, 1 * mm, 5 * mm), (TX + i * 0.012, front - 5.5 * mm, 0.27), M['port']))
parts.append(cylinder('button', 0.011, 2 * mm, (TX, front - 5.5 * mm, 0.225), M['case'], 20))
bpy.context.active_object.rotation_euler = (math.pi / 2, 0, 0)
parts.append(c.box('power-led', (2 * mm, 1 * mm, 0.14), (TX + 0.06, front - 5.5 * mm, 0.17), M['led']))
for i in range(6):
    parts.append(c.box(f'vent{i}', (1 * mm, 0.2, 3 * mm), (TX + 0.0855, TY + 0.03, 0.3 + i * 0.008), M['port']))
for dx in (-0.06, 0.06):
    for dy in (-0.15, 0.15):
        parts.append(cylinder(f'tower-foot{dx}{dy}', 0.012, 0.012, (TX + dx, TY + dy, 0.006), M['rubber'], 12))

# Rotated parts must be applied before joining: the boolean-free join keeps every transform.
for o in parts:
    bpy.context.view_layer.objects.active = o
    for s in bpy.context.selected_objects:
        s.select_set(False)
    o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

body = c.join(parts, 'Workstation')
out = c.args()
c.export_glb(out[0])
print('exported', out[0], 'faces', len(body.data.polygons))
if len(out) > 1:
    c.preview(out[1], target=(0.0, 0.0, 0.6), distance=2.6, angle=(-35, 22))
