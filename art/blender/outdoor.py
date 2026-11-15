"""What stands outside the buildings of Ouagadougou and Bobo-Dioulasso, modelled for the façades and the streets.

    blender --background --factory-startup --python art/blender/outdoor.py -- <kind> <out.glb> [preview.png]

Kinds: `ac_unit` (the outdoor unit of a split air conditioner on its wall brackets: white casing, fan grille, side
fins, copper pipes), `water_tank` (a black polyethylene tank on its steel tower, as on most roofs of the city),
`fence` (one 2.5 m bay of a low rendered wall with a steel railing on top) and `gate` (a sliding steel gate, its
two pillars and rail; the gate stands open beside the way in). Front at -Y (+Z in the game), base on the ground.
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


def cylinder(name, radius, depth, at, mat, vertices=24, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=at, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return o


def bar(name, a, b, radius, mat, vertices=10):
    """A round bar from point a to point b."""
    ax, ay, az = a
    bx, by, bz = b
    dx, dy, dz = bx - ax, by - ay, bz - az
    length = math.sqrt(dx * dx + dy * dy + dz * dz)
    o = cylinder(name, radius, length, ((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), mat, vertices,
                 rot=(math.acos(max(-1, min(1, dz / length))), 0, math.atan2(dx, -dy) if (dx or dy) else 0))
    return o


if kind == 'ac_unit':
    # 80 × 30 × 55 cm, hung 5 cm off the wall on two steel brackets; the fan behind a round grille on the left.
    casing = c.material('casing', '#eceae4', 0.45)
    grey = c.material('grille', '#3b4048', 0.5, 0.4)
    dark = c.material('fan', '#15181c', 0.6)
    steel = c.material('bracket', '#9aa1a9', 0.4, 0.8)
    copper = c.material('copper', '#b87333', 0.35, 1.0)
    foam = c.material('foam', '#d9d6cf', 0.8)
    W, D, H = 0.8, 0.3, 0.55
    y0 = -0.05 - D / 2
    parts.append(c.box('casing', (W, D, H), (0, y0, H / 2 + 0.03), casing, bevel=10 * mm, segments=3))
    parts.append(cylinder('opening', 0.215, 0.01, (-0.12, y0 - D / 2 - 0.001, H / 2 + 0.03), dark, 40, rot=(math.pi / 2, 0, 0)))
    for r in (0.07, 0.12, 0.17, 0.21):
        bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=0.0035, location=(-0.12, y0 - D / 2 - 0.008, H / 2 + 0.03), rotation=(math.pi / 2, 0, 0), major_segments=48, minor_segments=6)
        t = bpy.context.active_object
        t.name = f'ring{r}'
        t.data.materials.append(grey)
        parts.append(t)
    fy, fz = y0 - D / 2 - 0.008, H / 2 + 0.03
    parts.append(bar('spoke-h', (-0.33, fy, fz), (0.09, fy, fz), 0.003, grey, 6))
    parts.append(bar('spoke-v', (-0.12, fy, fz - 0.21), (-0.12, fy, fz + 0.21), 0.003, grey, 6))
    parts.append(cylinder('hub', 0.03, 0.02, (-0.12, y0 - D / 2 - 0.01, H / 2 + 0.03), grey, 20, rot=(math.pi / 2, 0, 0)))
    # Service panel on the right, the side fins, the logo plate.
    parts.append(c.box('panel', (0.2, 0.004, 0.38), (0.26, y0 - D / 2 - 0.002, H / 2 + 0.03), casing, bevel=2 * mm))
    for k in range(14):
        parts.append(c.box(f'fin{k}', (0.004, D - 0.06, 0.012), (W / 2 + 0.001, y0, 0.1 + k * 0.03), grey))
    parts.append(c.box('logo', (0.08, 0.003, 0.02), (0.26, y0 - D / 2 - 0.005, H - 0.04), grey))
    # Brackets from the wall, and the two insulated pipes going up the wall.
    for s in (-1, 1):
        parts.append(c.box(f'arm{s}', (0.03, 0.42, 0.03), (s * 0.3, -0.21, 0.015), steel, bevel=2 * mm))
        parts.append(c.box(f'post{s}', (0.03, 0.03, 0.35), (s * 0.3, -0.015, 0.16), steel, bevel=2 * mm))
        parts.append(bar(f'brace{s}', (s * 0.3, -0.015, 0.3), (s * 0.3, -0.38, 0.03), 0.008, steel))
    parts.append(cylinder('pipe1', 0.012, 0.9, (0.36, -0.03, 0.6), foam, 12))
    parts.append(cylinder('pipe2', 0.009, 0.9, (0.39, -0.03, 0.6), copper, 12))
    parts.append(bar('elbow', (0.36, -0.03, 0.2), (0.36, y0 + D / 2 - 0.02, 0.2), 0.012, foam, 12))
elif kind == 'water_tank':
    # A 2000-litre black tank, ribbed, its lid and the overflow, on a welded steel tower 1.5 m high.
    poly = c.material('polyethylene', '#121417', 0.55)
    lid = c.material('lid', '#1c1f24', 0.5)
    steel = c.material('steel', '#5d646d', 0.5, 0.7)
    pvc = c.material('pvc', '#d9d9d6', 0.5)
    rust = c.material('rust', '#7a4b2a', 0.85, 0.3)
    T, R, Hh = 1.5, 0.68, 1.35
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(c.box(f'leg{sx}{sy}', (0.06, 0.06, T), (sx * 0.62, sy * 0.62, T / 2), steel, bevel=2 * mm))
    for z in (0.35, T - 0.04):
        for s in (-1, 1):
            parts.append(c.box(f'beamx{z}{s}', (1.3, 0.05, 0.05), (0, s * 0.62, z), steel))
            parts.append(c.box(f'beamy{z}{s}', (0.05, 1.3, 0.05), (s * 0.62, 0, z), steel))
    for s in (-1, 1):
        parts.append(bar(f'cross{s}', (-0.62, s * 0.62, 0.38), (0.62, s * 0.62, T - 0.07), 0.012, steel))
        parts.append(bar(f'crossy{s}', (s * 0.62, -0.62, 0.38), (s * 0.62, 0.62, T - 0.07), 0.012, steel))
    parts.append(c.box('deck', (1.34, 1.34, 0.03), (0, 0, T + 0.015), rust))
    parts.append(cylinder('tank', R, Hh, (0, 0, T + 0.03 + Hh / 2), poly, 48))
    for k in range(5):
        bpy.ops.mesh.primitive_torus_add(major_radius=R + 0.004, minor_radius=0.014, location=(0, 0, T + 0.2 + k * 0.24), major_segments=48, minor_segments=8)
        t = bpy.context.active_object
        t.name = f'rib{k}'
        t.data.materials.append(poly)
        parts.append(t)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=12, radius=R, location=(0, 0, T + 0.03 + Hh))
    dome = bpy.context.active_object
    dome.name = 'dome'
    dome.scale = (1, 1, 0.22)
    dome.data.materials.append(poly)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.shade_smooth()
    parts.append(dome)
    parts.append(cylinder('lid', 0.2, 0.06, (0, 0, T + 0.03 + Hh + 0.15), lid, 32))
    # Pipes down the tower to the roof.
    parts.append(cylinder('down', 0.025, T + 0.25, (0.5, -0.5, (T + 0.25) / 2), pvc, 12))
    parts.append(bar('outlet', (0.5, -0.5, T + 0.25), (0.35, -0.35, T + 0.25), 0.025, pvc))
elif kind == 'fence':
    # One bay: a 1 m wall rendered in ochre with its coping, square pillars at the ends, a painted steel railing.
    render = c.material('render', '#d2b48c', 0.92)
    coping = c.material('coping', '#e9e4da', 0.7)
    paint = c.material('railing', '#1d4ed8', 0.45, 0.6)
    W = 2.5
    parts.append(c.box('wall', (W, 0.2, 1.0), (0, 0, 0.5), render, bevel=5 * mm))
    parts.append(c.box('coping', (W + 0.04, 0.26, 0.05), (0, 0, 1.025), coping, bevel=5 * mm))
    parts.append(c.box('pillar', (0.3, 0.3, 1.9), (W / 2, 0, 0.95), render, bevel=8 * mm))
    parts.append(c.box('cap', (0.36, 0.36, 0.06), (W / 2, 0, 1.93), coping, bevel=6 * mm))
    for z in (1.12, 1.78):
        parts.append(c.box(f'rail{z}', (W - 0.3, 0.04, 0.04), (-0.15, 0, z), paint, bevel=3 * mm))
    for k in range(18):
        x = -W / 2 + 0.06 + k * 0.13
        parts.append(c.box(f'bar{k}', (0.018, 0.018, 0.8), (x, 0, 1.45), paint))
        parts.append(c.box(f'spike{k}', (0.03, 0.006, 0.05), (x, 0, 1.87), paint))
elif kind == 'gate':
    # A 4 m way in: two pillars, the steel rail in the ground, the gate slid open behind the right-hand wall.
    render = c.material('render', '#d2b48c', 0.92)
    coping = c.material('coping', '#e9e4da', 0.7)
    paint = c.material('gate', '#1d4ed8', 0.45, 0.6)
    steel = c.material('rail', '#5d646d', 0.5, 0.8)
    lamp = c.material('lamp', '#fff7e0', 0.3, emission='#fff1c8', strength=4)
    W = 4.0
    for s in (-1, 1):
        parts.append(c.box(f'pillar{s}', (0.4, 0.4, 2.2), (s * (W / 2 + 0.2), 0, 1.1), render, bevel=8 * mm))
        parts.append(c.box(f'cap{s}', (0.46, 0.46, 0.06), (s * (W / 2 + 0.2), 0, 2.23), coping, bevel=6 * mm))
        parts.append(cylinder(f'globe{s}', 0.09, 0.2, (s * (W / 2 + 0.2), 0, 2.36), lamp, 20))
    parts.append(c.box('rail', (W * 2 + 0.6, 0.06, 0.02), (W / 2 + 0.2, 0, 0.01), steel))
    # The gate leaf, slid open behind the wall to the right (+X), on the street side of it.
    gx = W / 2 + 0.4 + W / 2
    for z in (0.12, 1.9):
        parts.append(c.box(f'frame{z}', (W, 0.06, 0.06), (gx, -0.3, z), paint, bevel=3 * mm))
    for s in (-1, 1):
        parts.append(c.box(f'stile{s}', (0.06, 0.06, 1.84), (gx + s * (W / 2 - 0.03), -0.3, 1.01), paint, bevel=3 * mm))
    parts.append(c.box('mid', (W, 0.04, 0.04), (gx, -0.3, 1.0), paint))
    for k in range(29):
        parts.append(c.box(f'bar{k}', (0.02, 0.02, 1.72), (gx - W / 2 + 0.13 + k * 0.133, -0.3, 1.01), paint))
    for s in (-1, 1):
        parts.append(cylinder(f'wheel{s}', 0.05, 0.03, (gx + s * (W / 2 - 0.3), -0.3, 0.05), steel, 20, rot=(math.pi / 2, 0, 0)))
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
    c.preview(argv[2], target=(0, 0, 0.8 if kind != 'water_tank' else 1.6), distance=3.2 if kind == 'ac_unit' else 7.5, angle=(-30, 15))
