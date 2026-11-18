"""The server cabinet in the corner of the technical room: a 42U, 600 x 900 mm cabinet, powder-coated, on a plinth, its
glazed front door in a steel frame with a swing handle and three hinges, the name plate on the door's top band, and
inside fourteen 2U servers, each with its ears, eight hot-swap drive caddies, a power button and three status lights.
The door's glass stays in the game (see-through, drawn last).

    blender --background --factory-startup --python art/blender/server_cabinet.py -- <out.glb> [preview.png]

Centred, floor at z = 0, front at y = -D/2 (+Z in the game). 0.60 x 0.90 m, 2.00 m high. The glass fills the door's
opening: x within +-0.25 m, z from 0.14 to 1.84 m, its plane 4 mm in front of the cabinet's front.
"""
import math
import os
import sys

import bpy

sys.path.append(os.path.dirname(__file__))
import common as c  # noqa: E402

mm = 0.001
W, D, H = 0.60, 0.90, 2.00
FRONT = -D / 2
c.reset()
M = {
    'body': c.material('body', '#3a4250', 0.55, 0.5),
    'frame': c.material('frame', '#252b35', 0.45, 0.6),
    'plinth': c.material('plinth', '#14171c', 0.7, 0.3),
    'inside': c.material('inside', '#05070a', 0.85, 0.2),
    'rail': c.material('rail', '#a9b2bc', 0.38, 0.85),
    'server': c.material('server', '#1f2630', 0.42, 0.6),
    'bezel': c.material('bezel', '#2d3542', 0.4, 0.55),
    'caddy': c.material('caddy', '#11151b', 0.5, 0.3),
    'latch': c.material('latch', '#8f9aa7', 0.3, 0.9),
    'chrome': c.material('chrome', '#cbd5e1', 0.22, 1.0),
    'print': c.material('print', '#e2e8f0', 0.5),
    'green': c.material('green', '#22c55e', 0.3, emission='#22c55e', strength=6),
    'cyan': c.material('cyan', '#38bdf8', 0.3, emission='#38bdf8', strength=6),
    'amber': c.material('amber', '#fbbf24', 0.3, emission='#fbbf24', strength=6),
}
LEDS = [M['green'], M['green'], M['cyan'], M['amber']]
parts = []


def cylinder(name, radius, depth, at, mat, vertices=16, rotate=(math.pi / 2, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=at, rotation=rotate)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


# The carcass: two sides, roof, back, plinth; dark inside.
for s in (-1, 1):
    parts.append(c.box(f'side{s}', (0.02, D - 0.03, H - 0.1), (s * (W / 2 - 0.01), 0.015, 0.1 + (H - 0.1) / 2), M['body'], bevel=2 * mm, segments=1))
parts.append(c.box('roof', (W, D, 0.03), (0, 0, H - 0.015), M['body'], bevel=3 * mm, segments=2))
parts.append(c.box('back', (W - 0.04, 0.015, H - 0.13), (0, D / 2 - 0.0075, 0.1 + (H - 0.13) / 2), M['body'], segments=1))
parts.append(c.box('plinth', (W - 0.02, D - 0.04, 0.1), (0, 0.01, 0.05), M['plinth'], bevel=1.5 * mm, segments=1))
parts.append(c.box('floor', (W - 0.04, D - 0.05, 0.01), (0, 0.02, 0.105), M['inside']))
parts.append(c.box('inner-back', (W - 0.04, 0.01, H - 0.15), (0, 0.05, 0.11 + (H - 0.15) / 2), M['inside']))
for s in (-1, 1):
    parts.append(c.box(f'inner-side{s}', (0.004, D - 0.1, H - 0.15), (s * (W / 2 - 0.023), 0.0, 0.11 + (H - 0.15) / 2), M['inside']))
    parts.append(c.box(f'rail{s}', (0.026, 3 * mm, H - 0.18), (s * 0.239, FRONT + 0.03, 0.11 + (H - 0.18) / 2), M['rail']))

# The door: a steel frame around the glass, a top band with the name plate, swing handle on the left, hinges on the right.
DOOR_Y = FRONT - 0.006
opening = (0.25, 0.14, H - 0.16)
door_bottom, door_top = 0.105, H - 0.035
parts.append(c.box('door-left', (W / 2 - opening[0], 0.02, door_top - door_bottom), (-(W / 2 + opening[0]) / 2, DOOR_Y, (door_top + door_bottom) / 2), M['frame'], bevel=2 * mm, segments=1))
parts.append(c.box('door-right', (W / 2 - opening[0], 0.02, door_top - door_bottom), ((W / 2 + opening[0]) / 2, DOOR_Y, (door_top + door_bottom) / 2), M['frame'], bevel=2 * mm, segments=1))
parts.append(c.box('door-bottom', (2 * opening[0] + 0.002, 0.02, opening[1] - door_bottom), (0, DOOR_Y, (opening[1] + door_bottom) / 2), M['frame'], bevel=2 * mm, segments=1))
parts.append(c.box('door-top', (2 * opening[0] + 0.002, 0.02, door_top - opening[2]), (0, DOOR_Y, (opening[2] + door_top) / 2), M['frame'], bevel=2 * mm, segments=1))
parts.append(c.box('plate', (0.3, 1.5 * mm, 0.05), (0, DOOR_Y - 0.0105, (opening[2] + door_top) / 2), M['inside'], bevel=2 * mm, segments=1))
parts.append(c.text('plate-text', 'SRV-01 · IST', 0.026, (0, DOOR_Y - 0.0118, (opening[2] + door_top) / 2), M['print'], resolution=3))
HX = -W / 2 + 0.025
parts.append(c.box('handle-base', (0.03, 6 * mm, 0.17), (HX, DOOR_Y - 0.012, H * 0.55), M['chrome'], bevel=4 * mm, segments=2))
parts.append(c.box('handle-lever', (0.014, 0.014, 0.12), (HX, DOOR_Y - 0.022, H * 0.55 - 0.01), M['chrome'], bevel=5 * mm, segments=2))
parts.append(cylinder('lock', 6 * mm, 4 * mm, (HX, DOOR_Y - 0.016, H * 0.55 + 0.065), M['latch'], 20))
for z in (0.3, H / 2, H - 0.3):
    parts.append(cylinder(f'hinge{z}', 6 * mm, 0.05, (W / 2 - 0.006, DOOR_Y - 0.004, z), M['latch'], 16, rotate=(0, 0, 0)))
# Vent slots along the roof's front edge.
for i in range(10):
    parts.append(c.box(f'roof-vent{i}', (0.035, 0.012, 1.2 * mm), (-0.2 + i * 0.045, FRONT + 0.04, H + 0.0002), M['inside'], bevel=4 * mm, segments=1))

# Fourteen 2U servers behind the glass.
SY = FRONT + 0.035  # their front
for i in range(14):
    z = 0.15 + i * 0.12
    parts.append(c.box(f'srv{i}', (0.5, 0.02, 0.085), (0, SY + 0.01, z), M['server'], bevel=1.5 * mm, segments=1))
    for s in (-1, 1):
        parts.append(c.box(f'ear{i}{s}', (0.022, 3 * mm, 0.085), (s * 0.239, SY + 0.0015, z), M['bezel'], bevel=1 * mm, segments=1))
        parts.append(c.box(f'pull{i}{s}', (8 * mm, 6 * mm, 0.05), (s * 0.239, SY - 0.002, z), M['latch'], bevel=2.5 * mm, segments=1))
    for k in range(8):
        x = -0.205 + k * 0.038
        parts.append(c.box(f'caddy{i}{k}', (0.034, 2.5 * mm, 0.07), (x, SY - 0.001, z), M['caddy'], bevel=1 * mm, segments=1))
        parts.append(c.box(f'caddy-latch{i}{k}', (0.026, 1.5 * mm, 8 * mm), (x, SY - 0.0028, z - 0.024), M['latch'], bevel=0.6 * mm, segments=1))
        parts.append(cylinder(f'caddy-led{i}{k}', 1.2 * mm, 1 * mm, (x + 0.011, SY - 0.0028, z + 0.028), LEDS[(i + k) % 2], 8))
    parts.append(c.box(f'panel{i}', (0.08, 2 * mm, 0.07), (0.17, SY - 0.0005, z), M['bezel'], bevel=1 * mm, segments=1))
    parts.append(cylinder(f'power{i}', 4.5 * mm, 2 * mm, (0.145, SY - 0.002, z), M['chrome'], 20))
    for k in range(3):
        parts.append(cylinder(f'led{i}{k}', 2.2 * mm, 1.2 * mm, (0.17 + k * 0.018, SY - 0.002, z + 0.02), LEDS[(i + k) % 4], 12))

for o in parts:
    bpy.context.view_layer.objects.active = o
    for sel in bpy.context.selected_objects:
        sel.select_set(False)
    o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

body = c.join(parts, 'ServerCabinet')
out = c.args()
c.export_glb(out[0])
print('exported', out[0], 'faces', len(body.data.polygons))
if len(out) > 1:
    c.preview(out[1], target=(0, FRONT, 1.0), distance=3.2, angle=(-10, 25))
