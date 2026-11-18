"""The floor-standing 19-inch rack's frame, as in every school technical room: folded-steel corner posts, front and rear
rails punched with square cage-nut holes (three per unit) and numbered unit by unit, a roof with two fans and a brush
cable entry, a ventilated plinth on four levelling feet, a vertical cable manager with T-head fingers on each side of
the front, a 1U brush panel under the patch panel, and the side panels' latches. The side panels' perforated sheets
stay in the game (a texture draws thousands of holes for nothing).

    blender --background --factory-startup --python art/blender/rack_frame.py -- <out.glb> [preview.png]

Centred on the rack's middle, floor at z = 0, front at y = -D/2 (+Z in the game). 0.62 x 0.60 m, 1.50 m high; the
rails' holes line up with the units the game counts from 0.07 m (above the plinth).
"""
import math
import os
import sys

import bpy

sys.path.append(os.path.dirname(__file__))
import common as c  # noqa: E402

mm = 0.001
U = 0.0445
W, D, H = 0.62, 0.60, 1.50
FRONT = -D / 2
BASE = 0.07  # the top of the plinth's frame: the first unit starts here
UNITS = 31
c.reset()
M = {
    'frame': c.material('frame', '#2a303a', 0.42, 0.65),
    'rail': c.material('rail', '#a9b2bc', 0.38, 0.85),
    'print': c.material('print', '#e5e9ee', 0.5),
    'duct': c.material('duct', '#14171c', 0.55, 0.3),
    'dark': c.material('dark', '#07080a', 0.85),
    'brush': c.material('brush', '#0d0f12', 0.95),
    'foot': c.material('foot', '#8e98a3', 0.35, 0.9),
    'rubber': c.material('rubber', '#111111', 0.9),
    'screw': c.material('screw', '#a7b0ba', 0.3, 0.9),
    'lock': c.material('lock', '#c3cad2', 0.25, 0.95),
}
parts = []


def cylinder(name, radius, depth, at, mat, vertices=24, rotate=(math.pi / 2, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=at, rotation=rotate)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def merged(objects, name):
    """Several cutters as one, so that a single boolean carves them all."""
    return c.join(objects, name)


# Corner posts: a folded C-profile 30 x 30 mm, open towards the inside of the rack.
for px in (-0.29, 0.29):
    s = 1 if px > 0 else -1
    for py in (FRONT - 0.005, D / 2 - 0.015):
        parts.append(c.box(f'post-face{px}{py}', (2.5 * mm, 0.03, H - 0.07), (px + s * 0.01375, py, BASE / 2 + H / 2 - 0.005), M['frame'], bevel=0.6 * mm, segments=1))
        for dy in (-0.01375, 0.01375):
            parts.append(c.box(f'post-flange{px}{py}{dy}', (0.03, 2.5 * mm, H - 0.07), (px, py + dy, BASE / 2 + H / 2 - 0.005), M['frame'], bevel=0.6 * mm, segments=1))

# Roof: a folded lid with two fans and a brush entry at the back for the cables that drop from the ladder tray.
roof = c.box('roof', (W, D, 0.04), (0, 0, H - 0.02), M['frame'], bevel=2 * mm, segments=3)
parts.append(roof)
parts.append(c.box('brush-slot', (0.44, 0.05, 1.2 * mm), (0, D / 2 - 0.07, H + 0.0002), M['dark'], bevel=0.8 * mm))
for side in (-1, 1):
    parts.append(c.box(f'brush-lip{side}', (0.44, 0.012, 1.5 * mm), (0, D / 2 - 0.07 + side * 0.019, H + 0.0008), M['brush'], bevel=0.5 * mm))
for fx in (-0.13, 0.13):
    parts.append(cylinder(f'fan{fx}', 0.062, 1.2 * mm, (fx, -0.04, H + 0.0002), M['dark'], 40, rotate=(0, 0, 0)))
    parts.append(cylinder(f'fan-hub{fx}', 0.016, 2 * mm, (fx, -0.04, H + 0.0008), M['frame'], 24, rotate=(0, 0, 0)))
    for r in (0.03, 0.047):
        ring = cylinder(f'fan-ring{fx}{r}', r + 1 * mm, 1.6 * mm, (fx, -0.04, H + 0.0006), M['frame'], 40, rotate=(0, 0, 0))
        hole = cylinder(f'fan-ring-hole{fx}{r}', r - 1 * mm, 4 * mm, (fx, -0.04, H + 0.0006), M['frame'], 40, rotate=(0, 0, 0))
        c.cut(ring, [hole])
        parts.append(ring)
    for a in (0, math.pi / 2):
        bar = c.box(f'fan-bar{fx}{a}', (0.124, 2 * mm, 1.6 * mm), (fx, -0.04, H + 0.0006), M['frame'])
        bar.rotation_euler = (0, 0, a + math.pi / 4)
        parts.append(bar)

# Plinth: the bottom frame the UPS stands on, a recessed ventilated skirt, and four levelling feet.
parts.append(c.box('base', (W, D, 0.012), (0, 0, BASE - 0.006), M['frame'], bevel=1.5 * mm))
parts.append(c.box('skirt', (W - 0.03, D - 0.03, 0.05), (0, 0, 0.033), M['frame'], bevel=1 * mm))
for i in range(14):
    x = -0.26 + i * 0.04
    for y in (FRONT + 0.0147, -FRONT - 0.0147):
        parts.append(c.box(f'vent{i}{y}', (0.026, 1.2 * mm, 0.012), (x, y - (0.0004 if y < 0 else -0.0004), 0.034), M['dark'], bevel=2.5 * mm, segments=1))
for fx in (-0.27, 0.27):
    for fy in (FRONT + 0.03, -FRONT - 0.03):
        parts.append(cylinder(f'foot-nut{fx}{fy}', 0.011, 0.006, (fx, fy, 0.011), M['foot'], 6, rotate=(0, 0, 0)))
        parts.append(cylinder(f'foot-pad{fx}{fy}', 0.02, 0.008, (fx, fy, 0.004), M['rubber'], 28, rotate=(0, 0, 0)))

# Rails: folded profiles, front and rear, their square holes three to a unit (1/4", 7/8", 1 1/2" above each unit's
# bottom), centred 232.5 mm from the axis as the 19-inch standard wants.
rail_bottom, rail_top = BASE - 0.02, BASE + UNITS * U + 0.002
rail_mid, rail_len = (rail_bottom + rail_top) / 2, rail_top - rail_bottom
for ry, flange_dir in ((FRONT + 0.006, 1), (D / 2 - 0.04, -1)):
    for s in (-1, 1):
        face = c.box(f'rail{ry}{s}', (0.026, 2 * mm, rail_len), (s * 0.239, ry, rail_mid), M['rail'])
        flange = c.box(f'rail-flange{ry}{s}', (2 * mm, 0.016, rail_len), (s * 0.251, ry + flange_dir * 0.008, rail_mid), M['rail'])
        holes = []
        for u in range(UNITS):
            for dz in (6.35 * mm, 22.225 * mm, 38.1 * mm):
                holes.append(c.box(f'h{u}{dz}', (9.5 * mm, 0.01, 9.5 * mm), (s * 0.2325, ry, BASE + u * U + dz), M['rail']))
        c.cut(face, [merged(holes, f'holes{ry}{s}')])
        parts += [face, flange]
        if ry < 0:
            for u in range(UNITS):
                parts.append(c.text(f'u{s}{u}', str(u + 1), 3.2 * mm, (s * 0.2465, ry - 1.1 * mm, BASE + u * U + U / 2), M['print'], resolution=2))

# Vertical cable managers beside the front posts: a back, an outer wall, T-head fingers every 2U, end caps.
for s in (-1, 1):
    x = s * 0.325
    mh = H - 0.14
    parts.append(c.box(f'mgr-back{s}', (0.06, 3 * mm, mh), (x, FRONT + 0.05, H / 2), M['duct'], bevel=0.8 * mm))
    parts.append(c.box(f'mgr-wall{s}', (3 * mm, 0.06, mh), (s * 0.3535, FRONT + 0.02, H / 2), M['duct'], bevel=0.8 * mm))
    for end in (H / 2 - mh / 2, H / 2 + mh / 2):
        parts.append(c.box(f'mgr-cap{s}{end}', (0.062, 0.064, 4 * mm), (x, FRONT + 0.019, end), M['duct'], bevel=1.2 * mm))
    z = 0.12
    while z < H - 0.08:
        parts.append(c.box(f'finger{s}{z}', (0.01, 0.058, 0.012), (s * 0.297, FRONT + 0.021, z), M['duct'], bevel=3 * mm, segments=2))
        parts.append(c.box(f'finger-head{s}{z}', (0.018, 0.006, 0.016), (s * 0.299, FRONT - 0.008, z), M['duct'], bevel=2.5 * mm, segments=1))
        z += 2 * U

# 1U brush panel under the top: cables pass through the bristles from the patch panel to the managers.
bz = 1.335 + U * 1.5
parts.append(c.box('brush-plate', (0.483, 2 * mm, U - 0.003), (0, FRONT + 0.003, bz), M['frame'], bevel=0.8 * mm))
parts.append(c.box('brush-gap', (0.40, 1 * mm, 0.018), (0, FRONT + 0.0016, bz), M['dark'], bevel=2 * mm))
for side in (-1, 1):
    parts.append(c.box(f'bristles{side}', (0.40, 1.4 * mm, 0.0085), (0, FRONT + 0.0014, bz + side * 0.0045), M['brush'], bevel=0.6 * mm))
    for zz in (bz - U / 2 + 6.35 * mm, bz + U / 2 - 6.35 * mm):
        parts.append(cylinder(f'brush-screw{side}{zz}', 3.2 * mm, 2 * mm, (side * 0.2325, FRONT + 0.001, zz), M['screw'], 16))

# Side panels' quarter-turn latches and the earth stud.
for s in (-1, 1):
    for z in (0.35, 1.15):
        latch = cylinder(f'latch{s}{z}', 0.011, 3 * mm, (s * 0.311, 0.18, z), M['lock'], 28, rotate=(0, math.pi / 2, 0))
        slot = c.box(f'latch-slot{s}{z}', (1.5 * mm, 0.014, 2.5 * mm), (s * 0.3127, 0.18, z), M['dark'])
        parts += [latch, slot]
    parts.append(cylinder(f'earth{s}', 4 * mm, 6 * mm, (s * 0.3125, D / 2 - 0.06, 0.12), M['foot'], 6, rotate=(0, math.pi / 2, 0)))

for o in parts:
    bpy.context.view_layer.objects.active = o
    for sel in bpy.context.selected_objects:
        sel.select_set(False)
    o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

body = c.join(parts, 'RackFrame')
out = c.args()
c.export_glb(out[0])
print('exported', out[0], 'faces', len(body.data.polygons))
if len(out) > 1:
    c.preview(out[1], target=(0, FRONT, 0.75), distance=2.6, angle=(-15, 20))
