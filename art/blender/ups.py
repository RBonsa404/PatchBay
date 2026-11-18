"""The rack's UPS (onduleur), at the bottom of every rack: a 3U rack-mount line-interactive unit, 3000 VA. Black front
bezel with its ventilation grille, a backlit LCD showing the load and the battery, the power button and the alarm-mute
button, the status lights (on line, on battery, replace battery, overload), its ears screwed to the rails.

    blender --background --factory-startup --python art/blender/ups.py -- <out.glb> [preview.png]

Sits on its base, centred, front face at y = -D/2 (+Z in the game). 0.44 x 0.45 m, 3U (0.1315 m); the ears reach the
rails at 0.483 m.
"""
import math
import os
import sys

import bpy

sys.path.append(os.path.dirname(__file__))
import common as c  # noqa: E402

mm = 0.001
U = 0.0445
W, D, H = 0.44, 0.45, 3 * U - 2 * mm
FRONT = -D / 2
c.reset()
M = {
    'case': c.material('case', '#1d2128', 0.5, 0.45),
    'bezel': c.material('bezel', '#121418', 0.42),
    'grille': c.material('grille', '#07080a', 0.85),
    'ear': c.material('ear', '#2a303a', 0.42, 0.65),
    'screw': c.material('screw', '#a7b0ba', 0.3, 0.9),
    'lcd': c.material('lcd', '#0b2a4a', 0.2, emission='#38a7f8', strength=1.4),
    'lcd-text': c.material('lcd-text', '#e0f2fe', 0.3, emission='#e0f2fe', strength=3),
    'print': c.material('print', '#cbd5e1', 0.5),
    'button': c.material('button', '#262a31', 0.45),
    'green': c.material('green', '#22c55e', 0.3, emission='#22c55e', strength=5),
    'off': c.material('led-off', '#3a2a12', 0.4),
}
parts = []


def cylinder(name, radius, depth, at, mat, vertices=24, rotate=(math.pi / 2, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=at, rotation=rotate)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


parts.append(c.box('case', (W, D - 0.01, H), (0, 0.005, H / 2), M['case'], bevel=1.5 * mm))
# The ears, screwed to the rails with two cage-nut screws each.
for s in (-1, 1):
    parts.append(c.box(f'ear{s}', (0.022, 2.5 * mm, H), (s * (W / 2 + 0.011), FRONT + 1.25 * mm, H / 2), M['ear'], bevel=0.8 * mm))
    for z in (U / 2, 2.5 * U):
        parts.append(cylinder(f'screw{s}{z}', 3.2 * mm, 2 * mm, (s * (W / 2 + 0.0115), FRONT - 0.5 * mm, z), M['screw'], 16))
# The bezel, slightly proud of the case, rounded, its grille across the left two thirds.
parts.append(c.box('bezel', (W - 4 * mm, 0.018, H - 4 * mm), (0, FRONT - 0.004, H / 2), M['bezel'], bevel=5 * mm, segments=3))
BF = FRONT - 0.013  # the face of the bezel
for row in range(5):
    for k in range(22):
        x = -0.2 + k * 0.0115 + (0.0057 if row % 2 else 0)
        if x > 0.055:
            continue
        parts.append(c.box(f'hole{row}-{k}', (8 * mm, 1.2 * mm, 0.013), (x, BF + 0.45 * mm, 0.032 + row * 0.017), M['grille'], bevel=2.5 * mm, segments=1))
# The control panel on the right: the LCD, its buttons, the lights.
parts.append(c.box('panel', (0.13, 1 * mm, H - 0.026), (0.135, BF - 0.4 * mm, H / 2), M['button'], bevel=3 * mm))
parts.append(c.box('lcd', (0.072, 1 * mm, 0.032), (0.12, BF - 1 * mm, 0.085), M['lcd'], bevel=1 * mm))
parts.append(c.text('lcd-load', 'CHARGE 34 %', 0.0062, (0.12, BF - 1.6 * mm, 0.091), M['lcd-text']))
parts.append(c.text('lcd-batt', 'BATTERIE 100 %', 0.0062, (0.12, BF - 1.6 * mm, 0.0795), M['lcd-text']))
for i, name in enumerate(('menu', 'enter')):
    parts.append(c.box(f'btn-{name}', (8 * mm, 2 * mm, 5 * mm), (0.172 + 0, BF - 1.2 * mm, 0.094 - i * 0.012), M['bezel'], bevel=1.2 * mm))
parts.append(cylinder('power', 0.0075, 3 * mm, (0.172, BF - 1.5 * mm, 0.045), M['bezel'], 32))
parts.append(cylinder('power-ring', 0.0092, 1 * mm, (0.172, BF - 0.8 * mm, 0.045), M['green'], 32))
parts.append(c.text('power-label', 'ON / OFF', 0.0045, (0.172, BF - 0.9 * mm, 0.031), M['print']))
for i, (name, mat) in enumerate((('SECTEUR', M['green']), ('BATTERIE', M['off']), ('REMPLACER', M['off']), ('SURCHARGE', M['off']))):
    x = 0.084 + i * 0.0215
    parts.append(cylinder(f'led{i}', 1.8 * mm, 1.5 * mm, (x, BF - 1 * mm, 0.054), mat, 12))
    parts.append(c.text(f'led-label{i}', name, 0.0026, (x, BF - 0.9 * mm, 0.046), M['print']))
parts.append(c.text('model', 'ONDULEUR  3000 VA', 0.0068, (-0.075, BF - 0.4 * mm, H - 0.014), M['print'], align='CENTER'))

for o in parts:
    bpy.context.view_layer.objects.active = o
    for s in bpy.context.selected_objects:
        s.select_set(False)
    o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

body = c.join(parts, 'UPS')
out = c.args()
c.export_glb(out[0])
print('exported', out[0], 'faces', len(body.data.polygons))
if len(out) > 1:
    c.preview(out[1], target=(0, FRONT, H / 2), distance=0.9, angle=(-22, 10))
