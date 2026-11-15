"""University furniture that no free library offers, modelled for the building's extra rooms.

    blender --background --factory-startup --python art/blender/furniture.py -- <kind> <out.glb> [preview.png]

Kinds: `wc` (a toilet cubicle: laminate partitions, a door, the bowl and its cistern, a paper holder), `washbasin` (a
two-basin counter with taps, the mirror above, a hand dryer), `vending` (a drinks and snacks machine, lit front),
`whiteboard` (a classroom whiteboard on the wall, its tray and markers). Front at -Y (+Z in the game), base on the floor.
"""
import math
import os
import sys

import bpy

sys.path.append(os.path.dirname(__file__))
import common as c  # noqa: E402

mm = 0.001
argv = c.args()
kind, out = argv[0], argv[1]
c.reset()
parts = []


def cylinder(name, radius, depth, at, mat, vertices=24, rot=(0, 0, 0), scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=at, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    o.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return o


def sphere(name, radius, at, mat, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=radius, location=at)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    o.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.shade_smooth()
    return o


if kind == 'wc':
    porcelain = c.material('porcelain', '#f4f5f6', 0.12)
    panel = c.material('hpl', '#8fa3b8', 0.35)
    steel = c.material('steel', '#c3c8ce', 0.25, 0.9)
    W, D, H = 0.95, 1.5, 2.0
    # Side partitions raised 15 cm off the floor on steel feet, the front with its door left ajar.
    for s in (-1, 1):
        parts.append(c.box(f'side{s}', (0.025, D, H - 0.15), (s * W / 2, 0, 0.15 + (H - 0.15) / 2), panel, bevel=3 * mm))
        for y in (-D / 2 + 0.05, D / 2 - 0.05):
            parts.append(cylinder(f'foot{s}{y}', 0.012, 0.15, (s * W / 2, y, 0.075), steel, 12))
    parts.append(c.box('front-l', (0.12, 0.025, H - 0.15), (-W / 2 + 0.06, -D / 2, 0.15 + (H - 0.15) / 2), panel, bevel=3 * mm))
    door = c.box('door', (W - 0.14, 0.025, H - 0.3), (0.07, -D / 2, 0.15 + (H - 0.3) / 2), panel, bevel=3 * mm)
    parts.append(door)
    parts.append(c.box('rail', (W, 0.03, 0.03), (0, -D / 2, H + 0.015), steel))
    parts.append(c.box('lock', (0.05, 0.03, 0.08), (W / 2 - 0.1, -D / 2 - 0.02, 1.0), steel, bevel=4 * mm))
    parts.append(c.box('sign', (0.04, 2 * mm, 0.015), (W / 2 - 0.1, -D / 2 - 0.036, 1.06), c.material('free', '#16a34a', 0.4)))
    # The bowl and its cistern against the back wall.
    parts.append(c.box('cistern', (0.38, 0.17, 0.42), (0, D / 2 - 0.1, 0.62), porcelain, bevel=20 * mm, segments=4))
    parts.append(c.box('flush', (0.07, 0.01, 0.04), (0, D / 2 - 0.19, 0.78), steel, bevel=3 * mm))
    parts.append(cylinder('pedestal', 0.12, 0.38, (0, D / 2 - 0.36, 0.19), porcelain, 32, scale=(1, 1.3, 1)))
    parts.append(cylinder('bowl', 0.19, 0.04, (0, D / 2 - 0.42, 0.4), porcelain, 40, scale=(0.95, 1.25, 1)))
    parts.append(cylinder('seat', 0.19, 0.025, (0, D / 2 - 0.42, 0.43), c.material('seat', '#e8eaec', 0.3), 40, scale=(0.97, 1.27, 1)))
    parts.append(cylinder('holder', 0.06, 0.11, (W / 2 - 0.08, D / 2 - 0.55, 0.7), steel, 20, rot=(0, math.pi / 2, 0)))
elif kind == 'washbasin':
    porcelain = c.material('porcelain', '#f4f5f6', 0.12)
    stone = c.material('counter', '#3b4048', 0.35)
    steel = c.material('steel', '#cfd4da', 0.18, 0.95)
    glass = c.material('mirror', '#b9c6d2', 0.08, 0.35)
    W = 1.6
    parts.append(c.box('counter', (W, 0.5, 0.04), (0, 0.0, 0.84), stone, bevel=4 * mm))
    parts.append(c.box('apron', (W, 0.02, 0.14), (0, -0.24, 0.76), stone, bevel=2 * mm))
    for x in (-0.4, 0.4):
        parts.append(cylinder(f'basin{x}', 0.2, 0.12, (x, -0.02, 0.8), porcelain, 40, scale=(1, 0.8, 1)))
        parts.append(cylinder(f'water{x}', 0.17, 0.01, (x, -0.02, 0.86), c.material('basin-in', '#d8dde2', 0.08), 40, scale=(1, 0.8, 1)))
        parts.append(cylinder(f'tap{x}', 0.018, 0.2, (x, 0.19, 0.96), steel, 16))
        parts.append(cylinder(f'spout{x}', 0.014, 0.14, (x, 0.13, 1.05), steel, 16, rot=(math.pi / 2, 0, 0)))
    parts.append(c.box('mirror', (W - 0.1, 0.01, 0.8), (0, 0.24, 1.55), glass))
    parts.append(c.box('mirror-frame', (W - 0.06, 0.008, 0.84), (0, 0.247, 1.55), steel))
    # The hand dryer on the wall beside the counter, the soap dispenser above each basin.
    parts.append(c.box('dryer', (0.27, 0.16, 0.3), (W / 2 + 0.35, 0.17, 1.15), c.material('dryer', '#e9ecef', 0.3, 0.2), bevel=25 * mm, segments=4))
    parts.append(c.box('dryer-mouth', (0.12, 0.05, 0.01), (W / 2 + 0.35, 0.15, 0.995), c.material('dark', '#1f2329', 0.6)))
    for x in (-0.4, 0.4):
        parts.append(c.box(f'soap{x}', (0.09, 0.07, 0.17), (x + 0.2, 0.21, 1.1), c.material('soap', '#f1f5f9', 0.3), bevel=10 * mm, segments=3))
elif kind == 'vending':
    body = c.material('body', '#b91c1c', 0.35, 0.3)
    dark = c.material('dark', '#14171c', 0.5)
    glass = c.material('glass', '#9fb6c8', 0.05, 0.0)
    lit = c.material('lit', '#fef9e7', 0.4, emission='#fff4d6', strength=2.5)
    W, D, H = 0.9, 0.8, 1.85
    parts.append(c.box('cabinet', (W, D, H), (0, 0, H / 2), body, bevel=8 * mm, segments=3))
    # The lit back of the display, the products standing in front of it, a thin frame where the glass would be.
    parts.append(c.box('window', (0.6, 0.01, 1.25), (-0.1, -D / 2, 1.1), lit))
    for s in (-1, 1):
        parts.append(c.box(f'gv{s}', (0.015, 0.03, 1.28), (-0.1 + s * 0.31, -D / 2 - 0.015, 1.1), dark))
        parts.append(c.box(f'gh{s}', (0.635, 0.03, 0.015), (-0.1, -D / 2 - 0.015, 1.1 + s * 0.64), dark))
    colours = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2']
    for row in range(5):
        parts.append(c.box(f'shelf{row}', (0.58, 0.012, 0.012), (-0.1, -D / 2 - 0.012, 0.53 + row * 0.25), dark))
        for k in range(6):
            mat = c.material(f'pack{row}{k}', colours[(row + k) % len(colours)], 0.5)
            parts.append(c.box(f'item{row}{k}', (0.07, 0.05, 0.16), (-0.35 + k * 0.1, -D / 2 - 0.03, 0.62 + row * 0.25), mat, bevel=3 * mm))
    parts.append(c.box('keypad', (0.14, 0.02, 0.32), (0.32, -D / 2 - 0.008, 1.15), dark, bevel=4 * mm))
    for i in range(12):
        parts.append(c.box(f'key{i}', (0.025, 0.006, 0.02), (0.29 + (i % 3) * 0.03, -D / 2 - 0.02, 1.05 + (i // 3) * 0.035), c.material(f'k{i}', '#cbd5e1', 0.4)))
    parts.append(c.box('screen', (0.1, 0.006, 0.05), (0.32, -D / 2 - 0.02, 1.25), c.material('lcd', '#38bdf8', 0.3, emission='#38bdf8', strength=3)))
    parts.append(c.box('tray', (0.6, 0.06, 0.18), (-0.1, -D / 2 - 0.02, 0.25), dark, bevel=6 * mm))
    parts.append(c.box('plinth', (W - 0.02, D - 0.02, 0.08), (0, 0, 0.04), dark))
elif kind == 'whiteboard':
    board = c.material('board', '#f8fafc', 0.15)
    frame = c.material('frame', '#9aa3ad', 0.3, 0.85)
    W, H = 2.4, 1.2
    parts.append(c.box('board', (W, 0.012, H), (0, 0, 1.45), board))
    for s in (-1, 1):
        parts.append(c.box(f'fv{s}', (0.025, 0.025, H + 0.05), (s * (W / 2 + 0.0125), -0.004, 1.45), frame, bevel=2 * mm))
        parts.append(c.box(f'fh{s}', (W + 0.05, 0.025, 0.025), (0, -0.004, 1.45 + s * (H / 2 + 0.0125)), frame, bevel=2 * mm))
    parts.append(c.box('tray', (W * 0.6, 0.07, 0.02), (0, -0.04, 1.45 - H / 2 - 0.035), frame, bevel=2 * mm))
    for i, colour in enumerate(('#1d4ed8', '#dc2626', '#111827', '#16a34a')):
        parts.append(cylinder(f'marker{i}', 0.009, 0.13, (-0.3 + i * 0.07, -0.05, 1.45 - H / 2 - 0.016), c.material(f'm{i}', colour, 0.4), 12, rot=(0, math.pi / 2, 0)))
    parts.append(c.box('eraser', (0.13, 0.05, 0.035), (0.3, -0.045, 1.45 - H / 2 - 0.008), c.material('felt', '#334155', 0.8), bevel=3 * mm))
    # Faint traces of the last lesson: a subnet written and half wiped.
    ink = c.material('ink', '#3b5bdb', 0.6)
    parts.append(c.text('lesson', '192.168.10.0 /24', 0.09, (-0.55, -0.0065, 1.75), ink))
    parts.append(c.text('lesson2', 'masque 255.255.255.0', 0.07, (-0.45, -0.0065, 1.6), ink))
else:
    raise SystemExit(f'unknown kind {kind}')

for o in parts:
    for s in bpy.context.selected_objects:
        s.select_set(False)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
body = c.join(parts, kind)
c.export_glb(out)
print('exported', out, 'faces', len(body.data.polygons))
if len(argv) > 2:
    c.preview(argv[2], target=(0, 0, 0.9), distance=4.2, angle=(-30, 15))
