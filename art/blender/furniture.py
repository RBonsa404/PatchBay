"""University furniture that no free library offers, modelled for the building's extra rooms.

    blender --background --factory-startup --python art/blender/furniture.py -- <kind> <out.glb> [preview.png]

Kinds: `wc` (a toilet cubicle: laminate partitions, a door, the bowl and its cistern, a paper holder), `washbasin` (a
two-basin counter with taps, the mirror above, a hand dryer), `vending` (a drinks and snacks machine, lit front),
`whiteboard` (a classroom whiteboard on the wall, its tray and markers), `reception` (a counter), `meeting` (a table
for eight), `lockers` (three steel locker columns), `binder_cabinet` (a low cabinet of binders), `projector` (on its
ceiling mount) and `screen_case` (a projection screen's housing and bottom bar). Front at -Y (+Z in the game), base on the floor.
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
        parts.append(cylinder(f'basin{x}', 0.2, 0.128, (x, -0.02, 0.804), porcelain, 40, scale=(1, 0.8, 1)))
        parts.append(cylinder(f'water{x}', 0.17, 0.004, (x, -0.02, 0.8705), c.material('basin-in', '#d8dde2', 0.08), 40, scale=(1, 0.8, 1)))
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
elif kind == 'reception':
    # A reception counter: a high front in two tones, its raised shelf for visitors, the low desk behind.
    front = c.material('front', '#0b1e3f', 0.45)
    top = c.material('top', '#e8e2d6', 0.35)
    stripe = c.material('stripe', '#fbbf24', 0.4, emission='#fbbf24', strength=0.6)
    W = 2.0
    parts.append(c.box('front', (W, 0.05, 1.1), (0, -0.33, 0.55), front, bevel=6 * mm))
    for s in (-1, 1):
        parts.append(c.box(f'side{s}', (0.05, 0.7, 1.1), (s * (W / 2 - 0.025), 0, 0.55), front, bevel=6 * mm))
    parts.append(c.box('shelf', (W + 0.06, 0.3, 0.035), (0, -0.28, 1.12), top, bevel=4 * mm))
    parts.append(c.box('desk', (W - 0.1, 0.6, 0.03), (0, 0.05, 0.74), top, bevel=3 * mm))
    parts.append(c.box('stripe', (W - 0.1, 0.006, 0.03), (0, -0.358, 0.85), stripe))
elif kind == 'meeting':
    # A meeting table for eight: a light oak top on two steel frames, a cable box in the middle.
    oak = c.material('oak', '#b08a5a', 0.45)
    steel = c.material('steel', '#2f3640', 0.35, 0.8)
    W, D = 2.4, 1.1
    parts.append(c.box('top', (W, D, 0.03), (0, 0, 0.735), oak, bevel=8 * mm, segments=3))
    for s in (-1, 1):
        parts.append(c.box(f'leg{s}', (0.06, D - 0.2, 0.7), (s * (W / 2 - 0.25), 0, 0.37), steel, bevel=4 * mm))
        parts.append(c.box(f'foot{s}', (0.08, D - 0.1, 0.03), (s * (W / 2 - 0.25), 0, 0.015), steel, bevel=4 * mm))
    parts.append(c.box('box', (0.3, 0.12, 0.012), (0, 0, 0.756), steel, bevel=2 * mm))
elif kind == 'lockers':
    # Three steel locker columns side by side, two doors each: louvres pressed into the doors, a number plate, a
    # padlock hasp, a plinth set back from the front.
    body = c.material('locker', '#7b8794', 0.42, 0.6)
    doorm = c.material('locker-door', '#8a96a3', 0.38, 0.6)
    dark = c.material('slot', '#1f2933', 0.7)
    steel = c.material('steel', '#c3c8ce', 0.25, 0.9)
    plate_m = c.material('plate', '#e2e8f0', 0.5)
    W, D, H, N = 0.58, 0.5, 2.0, 3
    for n in range(N):
        x = (n - (N - 1) / 2) * 0.6
        parts.append(c.box(f'carcass{n}', (W, D - 0.02, H - 0.08), (x, 0.01, 0.08 + (H - 0.08) / 2), body, bevel=4 * mm))
        parts.append(c.box(f'plinth{n}', (W - 0.04, D - 0.08, 0.08), (x, 0.03, 0.04), dark))
        for tier, (z0, z1) in enumerate(((0.12, 1.02), (1.06, 1.96))):
            h = z1 - z0
            zc = (z0 + z1) / 2
            parts.append(c.box(f'door{n}{tier}', (W - 0.03, 0.018, h), (x, -D / 2 - 0.004, zc), doorm, bevel=3 * mm))
            # Six louvres near the top of each door, then the hasp and the number.
            for k in range(6):
                parts.append(c.box(f'louvre{n}{tier}{k}', (0.22, 0.006, 0.012), (x, -D / 2 - 0.014, z1 - 0.07 - k * 0.026), dark, bevel=2 * mm))
            parts.append(c.box(f'hasp{n}{tier}', (0.03, 0.02, 0.07), (x + W / 2 - 0.07, -D / 2 - 0.022, zc), steel, bevel=3 * mm))
            parts.append(cylinder(f'ring{n}{tier}', 0.012, 0.006, (x + W / 2 - 0.07, -D / 2 - 0.034, zc + 0.02), steel, 12, rot=(math.pi / 2, 0, 0)))
            parts.append(c.box(f'plate{n}{tier}', (0.08, 0.004, 0.035), (x, -D / 2 - 0.015, z1 - 0.26), plate_m, bevel=1 * mm))
            parts.append(c.text(f'num{n}{tier}', str(n * 2 + tier + 1), 0.022, (x, -D / 2 - 0.0175, z1 - 0.268), dark))
    parts.append(c.box('top', (N * 0.6 - 0.02, D, 0.012), (0, 0, H + 0.006), body, bevel=2 * mm))
elif kind == 'binder_cabinet':
    # A low office cabinet, 2.6 m long: grey carcass, four sliding doors with recessed pulls, an oak top, and the
    # year's binders standing on it, their spines labelled.
    body = c.material('cabinet', '#9aa5b1', 0.45, 0.3)
    doorm = c.material('cabinet-door', '#aab4bf', 0.4, 0.3)
    oak = c.material('oak', '#b08a5a', 0.45)
    dark = c.material('pull', '#2f3640', 0.4, 0.7)
    label = c.material('label', '#f8fafc', 0.6)
    binders = [c.material(f'binder{k}', colour, 0.6) for k, colour in enumerate(('#1d4ed8', '#fbbf24', '#0b1e3f', '#94a3b8'))]
    W, D, H = 2.6, 0.5, 0.85
    parts.append(c.box('carcass', (W, D - 0.02, H - 0.09), (0, 0.01, 0.06 + (H - 0.09) / 2), body, bevel=4 * mm))
    parts.append(c.box('plinth', (W - 0.04, D - 0.08, 0.06), (0, 0.03, 0.03), dark))
    parts.append(c.box('top', (W + 0.04, D + 0.03, 0.03), (0, -0.005, H - 0.015), oak, bevel=4 * mm, segments=3))
    for i in range(4):
        x = -W / 2 + W / 8 + i * W / 4
        offset = -0.012 if i % 2 == 0 else -0.026
        parts.append(c.box(f'door{i}', (W / 4 + 0.02, 0.014, H - 0.16), (x, -D / 2 + offset, 0.06 + (H - 0.16) / 2 + 0.02), doorm, bevel=2 * mm))
        side = 1 if i % 2 == 0 else -1
        parts.append(c.box(f'pull{i}', (0.02, 0.008, 0.16), (x + side * (W / 8 - 0.06), -D / 2 + offset - 0.009, 0.5), dark, bevel=2 * mm))
    for i in range(23):
        x = -W / 2 + 0.3 + i * 0.086 + (0.04 if i >= 12 else 0)
        parts.append(c.box(f'binder{i}', (0.05, 0.28, 0.32), (x, 0.0, H + 0.16), binders[i % 4], bevel=3 * mm))
        parts.append(c.box(f'spine{i}', (0.032, 0.004, 0.09), (x, -0.141, H + 0.2), label))
        parts.append(cylinder(f'hole{i}', 0.012, 0.004, (x, -0.142, H + 0.07), dark, 12, rot=(math.pi / 2, 0, 0)))
elif kind == 'projector':
    # A classroom projector on its ceiling mount: white body with rounded edges, the lens and its focus ring at the
    # front (-Y), vents along the side, the pole up to the ceiling plate at 3 m.
    white = c.material('projector', '#e8ebef', 0.4)
    grey = c.material('projector-grey', '#5b6470', 0.45, 0.4)
    black = c.material('black', '#0b0d10', 0.3)
    glass = c.material('lens', '#1e293b', 0.05, 0.2, emission='#e0f2fe', strength=1.5)
    steel = c.material('steel', '#b8bec6', 0.3, 0.9)
    led = c.material('led', '#22c55e', 0.3, emission='#22c55e', strength=6)
    zc = 2.72
    parts.append(c.box('body', (0.34, 0.28, 0.11), (0, 0, zc), white, bevel=14 * mm, segments=4))
    parts.append(c.box('band', (0.342, 0.282, 0.012), (0, 0, zc - 0.035), grey, bevel=4 * mm))
    parts.append(cylinder('barrel', 0.05, 0.03, (-0.07, -0.145, zc), black, 32, rot=(math.pi / 2, 0, 0)))
    parts.append(cylinder('ring', 0.044, 0.012, (-0.07, -0.166, zc), grey, 32, rot=(math.pi / 2, 0, 0)))
    parts.append(cylinder('glass', 0.036, 0.004, (-0.07, -0.173, zc), glass, 32, rot=(math.pi / 2, 0, 0)))
    for k in range(7):
        parts.append(c.box(f'vent{k}', (0.004, 0.012, 0.06), (0.172, -0.08 + k * 0.025, zc), black))
        parts.append(c.box(f'grille{k}', (0.008, 0.004, 0.05), (0.03 + k * 0.016, -0.141, zc), black))
    parts.append(cylinder('power', 0.006, 0.003, (0.14, -0.141, zc + 0.03), led, 12, rot=(math.pi / 2, 0, 0)))
    parts.append(c.box('cradle', (0.2, 0.16, 0.012), (0, 0.02, zc + 0.061), steel, bevel=2 * mm))
    parts.append(cylinder('pole', 0.018, 3.0 - zc - 0.067, (0, 0.02, (3.0 + zc + 0.067) / 2), steel, 16))
    parts.append(cylinder('collar', 0.024, 0.03, (0, 0.02, zc + 0.12), grey, 16))
    parts.append(cylinder('plate', 0.07, 0.008, (0, 0.02, 2.996), steel, 32))
    parts.append(cylinder('cable', 0.005, 3.0 - zc - 0.07, (0.03, 0.06, (3.0 + zc + 0.07) / 2), black, 8))
elif kind == 'screen_case':
    # A wall projection screen's housing: a white aluminium case across the top with its end caps and wall
    # brackets, the black weighted bar at the bottom and its pull cord. The screen itself is drawn by the game.
    alu = c.material('case', '#eef1f4', 0.35, 0.4)
    cap = c.material('cap', '#3f4752', 0.45)
    black = c.material('bar', '#14171c', 0.4, 0.3)
    W = 2.55
    parts.append(cylinder('case', 0.045, W, (0, -0.05, 2.74), alu, 24, rot=(0, math.pi / 2, 0), scale=(0.85, 1, 1)))
    for s in (-1, 1):
        parts.append(cylinder(f'cap{s}', 0.048, 0.03, (s * (W / 2 + 0.015), -0.05, 2.74), cap, 24, rot=(0, math.pi / 2, 0)))
        parts.append(c.box(f'bracket{s}', (0.04, 0.05, 0.08), (s * (W / 2 - 0.2), -0.015, 2.74), cap, bevel=2 * mm))
    parts.append(c.box('slot', (W - 0.08, 0.012, 0.006), (0, -0.05, 2.692), black))
    parts.append(c.box('bottom', (W - 0.1, 0.024, 0.03), (0, -0.03, 1.2), black, bevel=4 * mm))
    parts.append(cylinder('cord', 0.003, 0.14, (0, -0.03, 1.115), black, 8))
    parts.append(sphere('knob', 0.016, (0, -0.03, 1.04), black))
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
