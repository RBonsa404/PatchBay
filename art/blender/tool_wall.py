"""The technical room's tool wall on the right wall: a low steel cupboard (two doors with bar handles, a lock, a recessed
plinth, a label holder) under a perforated pegboard on stand-offs, with the cabling tools hung on their hooks: three
coils of patch cable, an RJ45 crimper, a cable tester and its remote, side cutters, a punch-down tool, a row of
screwdrivers in their rack, a cable stripper and a roll of hook-and-loop ties.

    blender --background --factory-startup --python art/blender/tool_wall.py -- <out.glb> [preview.png]

The origin is on the wall, at floor level, in the middle of the cupboard; the model stands out of the wall towards -Y
(+Z in the game, which turns it to face the room). The cupboard is 1.25 m wide, 0.45 m deep and 0.85 m high, its top
(wood, drawn by the game) above that; the pegboard is 1.25 x 0.8 m, centred 1.65 m above the floor.
"""
import math
import os
import sys

import bmesh
import bpy

sys.path.append(os.path.dirname(__file__))
import common as c  # noqa: E402

mm = 0.001
W, D, H = 1.25, 0.45, 0.85
c.reset()
M = {
    'carcass': c.material('carcass', '#9aa6b5', 0.55, 0.35),
    'door': c.material('door', '#a7b2c0', 0.5, 0.35),
    'plinth': c.material('plinth', '#232a33', 0.7, 0.2),
    'gap': c.material('gap', '#0d1117', 0.9),
    'chrome': c.material('chrome', '#d5dbe2', 0.22, 1.0),
    'steel': c.material('steel', '#8d96a1', 0.35, 0.9),
    'label': c.material('label', '#f8fafc', 0.8),
    'ink': c.material('ink', '#0b1e3f', 0.6),
    'frame': c.material('frame', '#b9c1ca', 0.35, 0.85),
    'red': c.material('red', '#c81e1e', 0.5),
    'blue': c.material('blue', '#1d4ed8', 0.5),
    'yellow': c.material('yellow', '#f5b301', 0.5),
    'amber': c.material('amber', '#f59e0b', 0.5),
    'black': c.material('black', '#15191f', 0.55),
    'screen': c.material('screen', '#0c2a1f', 0.25, emission='#22c55e', strength=0.6),
    'cable-blue': c.material('cable-blue', '#2563eb', 0.45),
    'cable-orange': c.material('cable-orange', '#f59e0b', 0.45),
    'cable-cyan': c.material('cable-cyan', '#7dd3fc', 0.45),
    'velcro': c.material('velcro', '#111827', 0.95),
}
parts = []


def pegboard_material():
    """Pegboard: dark painted hardboard with a square grid of round holes at the usual 25 mm pitch. The holes are the
    picture's alpha (the game cuts them out, see `props.ts`); 256 pixels hold 8 x 8 holes, 0.2 m of board."""
    size, pitch, radius = 256, 32, 4.5
    img = bpy.data.images.new('pegboard', size, size, alpha=True)
    board = c.srgb('#3b4757')
    px = [0.0] * (size * size * 4)
    for y in range(size):
        cy = (y // pitch) * pitch + pitch / 2
        for x in range(size):
            cx = (x // pitch) * pitch + pitch / 2
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            a = min(1.0, max(0.0, d - radius + 0.5))
            i = (y * size + x) * 4
            px[i:i + 4] = [board[0], board[1], board[2], a]
    img.pixels = px
    img.pack()
    m = bpy.data.materials.new('perforated')
    m.use_nodes = True
    nodes = m.node_tree.nodes
    bsdf = nodes.get('Principled BSDF')
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = img
    m.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    m.node_tree.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    bsdf.inputs['Roughness'].default_value = 0.8
    return m


M['pegboard'] = pegboard_material()


def cylinder(name, radius, depth, at, mat, vertices=16, rotate=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=at, rotation=rotate)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def torus(name, major, minor, at, mat, rotate=(math.pi / 2, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_segments=28, minor_segments=8, major_radius=major, minor_radius=minor, location=at, rotation=rotate)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


# --- The cupboard -----------------------------------------------------------------------------------------------------
CY = -D / 2  # centre of the cupboard's depth (the wall is y = 0)
FRONT = -D
parts.append(c.box('plinth', (W - 0.04, D - 0.05, 0.08), (0, CY + 0.02, 0.04), M['plinth'], bevel=2 * mm))
parts.append(c.box('carcass', (W, D - 0.02, H - 0.08), (0, CY + 0.01, 0.08 + (H - 0.08) / 2), M['carcass'], bevel=3 * mm))
# Two doors, a 3 mm shadow gap between them and around them.
DW = W / 2 - 0.006
for s in (-1, 1):
    x = s * (DW / 2 + 0.003)
    parts.append(c.box(f'door{s}', (DW, 0.018, H - 0.1), (x, FRONT + 0.009, 0.09 + (H - 0.1) / 2), M['door'], bevel=2.5 * mm))
    # A pressed stiffening panel in the door.
    parts.append(c.box(f'panel{s}', (DW - 0.09, 2 * mm, H - 0.22), (x, FRONT - 0.5 * mm, 0.09 + (H - 0.1) / 2), M['door'], bevel=4 * mm, segments=3))
    # Bar handle near the meeting edge, on its two feet.
    hx = s * 0.045
    parts.append(cylinder(f'handle{s}', 6 * mm, 0.16, (hx, FRONT - 0.03, 0.55), M['chrome'], vertices=12))
    for dz in (-0.07, 0.07):
        parts.append(cylinder(f'foot{s}{dz}', 4.5 * mm, 0.03, (hx, FRONT - 0.015, 0.55 + dz), M['chrome'], vertices=10, rotate=(math.pi / 2, 0, 0)))
    # Hinges on the outer edges.
    for z in (0.18, 0.72):
        parts.append(cylinder(f'hinge{s}{z}', 5 * mm, 0.06, (s * (W / 2 - 0.004), FRONT + 0.004, z), M['steel'], vertices=10))
parts.append(c.box('gap', (3 * mm, 2 * mm, H - 0.1), (0, FRONT - 0.2 * mm, 0.09 + (H - 0.1) / 2), M['gap']))
# Cylinder lock on the right door, a label holder on the left one.
parts.append(cylinder('lock', 9 * mm, 0.012, (0.1, FRONT - 0.004, 0.69), M['chrome'], vertices=16, rotate=(math.pi / 2, 0, 0)))
parts.append(c.box('keyway', (1.5 * mm, 1 * mm, 9 * mm), (0.1, FRONT - 0.0105, 0.69), M['gap']))
parts.append(c.box('holder', (0.14, 3 * mm, 0.05), (-0.17, FRONT - 1.5 * mm, 0.69), M['steel'], bevel=1 * mm))
parts.append(c.box('card', (0.125, 1 * mm, 0.036), (-0.17, FRONT - 3.2 * mm, 0.69), M['label']))
parts.append(c.text('card-text', 'OUTILLAGE', 0.016, (-0.17, FRONT - 3.9 * mm, 0.69), M['ink'], resolution=3))

# --- The pegboard -----------------------------------------------------------------------------------------------------
PW, PH, PZ = 1.25, 0.8, 1.65
PY = -0.02  # its face, on 20 mm stand-offs
mesh = bpy.data.meshes.new('pegboard')
bm = bmesh.new()
uv = bm.loops.layers.uv.new('UVMap')
x0, x1, z0, z1 = -PW / 2 + 0.012, PW / 2 - 0.012, PZ - PH / 2 + 0.012, PZ + PH / 2 - 0.012
face = bm.faces.new([bm.verts.new((x, PY + 2 * mm, z)) for x, z in ((x0, z0), (x1, z0), (x1, z1), (x0, z1))])
for loop in face.loops:
    co = loop.vert.co
    loop[uv].uv = ((co.x - x0) / 0.2, (co.z - z0) / 0.2)
bm.to_mesh(mesh)
bm.free()
board = bpy.data.objects.new('pegboard', mesh)
board.data.materials.append(M['pegboard'])
bpy.context.collection.objects.link(board)
pegboard = board
# An aluminium edge round the board.
for name, size, at in (
    ('edge-top', (PW, 0.014, 0.014), (0, PY + 0.004, PZ + PH / 2 - 0.007)),
    ('edge-bottom', (PW, 0.014, 0.014), (0, PY + 0.004, PZ - PH / 2 + 0.007)),
    ('edge-left', (0.014, 0.014, PH), (-PW / 2 + 0.007, PY + 0.004, PZ)),
    ('edge-right', (0.014, 0.014, PH), (PW / 2 - 0.007, PY + 0.004, PZ)),
):
    parts.append(c.box(name, size, at, M['frame'], bevel=1.5 * mm))


def hook(x, z, length=0.06):
    """A pegboard hook: the bent end in the hole, the arm out, a little upturn at the tip."""
    parts.append(cylinder(f'hook-{x:.3f}-{z:.3f}', 2.2 * mm, length, (x, PY - length / 2, z), M['steel'], vertices=8, rotate=(math.pi / 2, 0, 0)))
    parts.append(cylinder(f'tip-{x:.3f}-{z:.3f}', 2.2 * mm, 0.014, (x, PY - length, z + 0.006), M['steel'], vertices=8))


# Three coils of patch cable on long hooks, top left.
for i, (mat, x) in enumerate(((M['cable-blue'], -0.45), (M['cable-orange'], -0.22), (M['cable-cyan'], 0.01))):
    hook(x, 1.96, 0.07)
    for k in range(5):
        parts.append(torus(f'coil{i}-{k}', 0.075 - k * 0.002, 3 * mm, (x + (k - 2) * 0.0015, PY - 0.035 + (k - 2) * 0.006, 1.89 - k * 0.003), mat))
    # The two plugs hanging out of the coil.
    for s in (-1, 1):
        parts.append(c.box(f'plug{i}{s}', (0.012, 0.024, 0.014), (x + s * 0.02, PY - 0.03, 1.8), M['label'], bevel=1.5 * mm))

# RJ45 crimper: two red grips opening downwards from the steel head.
hook(0.24, 1.86)
parts.append(c.box('crimp-head', (0.05, 0.016, 0.07), (0.24, PY - 0.05, 1.83), M['steel'], bevel=3 * mm))
parts.append(c.box('crimp-die', (0.034, 0.018, 0.012), (0.24, PY - 0.05, 1.845), M['black'], bevel=1 * mm))
for s in (-1, 1):
    grip = c.box(f'crimp-grip{s}', (0.022, 0.016, 0.16), (0.24 + s * 0.022, PY - 0.05, 1.71), M['red'], bevel=6 * mm, segments=3)
    grip.rotation_euler = (0, s * 0.16, 0)
    parts.append(grip)

# Cable tester and its remote, side by side on a shelf hook.
hook(0.42, 1.88)
parts.append(c.box('tester', (0.08, 0.035, 0.15), (0.42, PY - 0.03, 1.8), M['amber'], bevel=8 * mm, segments=3))
parts.append(c.box('tester-screen', (0.05, 2 * mm, 0.035), (0.42, PY - 0.048, 1.835), M['screen'], bevel=1 * mm))
for k in range(4):
    parts.append(c.box(f'tester-led{k}', (6 * mm, 1.5 * mm, 6 * mm), (0.395 + k * 0.017, PY - 0.048, 1.79), M['black'], bevel=1 * mm))
parts.append(c.box('tester-port', (0.016, 0.01, 0.013), (0.42, PY - 0.03, 1.72), M['black'], bevel=1 * mm))
hook(0.53, 1.84)
parts.append(c.box('remote', (0.045, 0.03, 0.08), (0.53, PY - 0.03, 1.79), M['amber'], bevel=6 * mm, segments=3))
parts.append(c.box('remote-port', (0.016, 0.01, 0.013), (0.53, PY - 0.03, 1.745), M['black'], bevel=1 * mm))

# Side cutters (blue grips), the punch-down tool (yellow), the stripper (black), along the second row.
hook(-0.42, 1.6)
parts.append(c.box('cutter-head', (0.035, 0.012, 0.05), (-0.42, PY - 0.045, 1.57), M['steel'], bevel=3 * mm))
for s in (-1, 1):
    g = c.box(f'cutter-grip{s}', (0.018, 0.014, 0.12), (-0.42 + s * 0.016, PY - 0.045, 1.48), M['blue'], bevel=5 * mm, segments=3)
    g.rotation_euler = (0, s * 0.12, 0)
    parts.append(g)
hook(-0.25, 1.6)
parts.append(cylinder('punch-body', 0.017, 0.14, (-0.25, PY - 0.04, 1.51), M['yellow'], vertices=14))
parts.append(cylinder('punch-cap', 0.017, 0.012, (-0.25, PY - 0.04, 1.586), M['black'], vertices=14))
parts.append(cylinder('punch-blade', 3.5 * mm, 0.05, (-0.25, PY - 0.04, 1.415), M['steel'], vertices=8))
hook(-0.1, 1.6)
parts.append(c.box('stripper', (0.026, 0.02, 0.1), (-0.1, PY - 0.04, 1.54), M['black'], bevel=6 * mm, segments=3))
parts.append(c.box('stripper-blade', (0.02, 0.022, 0.012), (-0.1, PY - 0.04, 1.592), M['steel'], bevel=1 * mm))

# A rack of six screwdrivers: a steel strip on two hooks, handles above, shafts through it.
parts.append(c.box('rack', (0.24, 0.05, 0.012), (0.14, PY - 0.03, 1.5), M['steel'], bevel=1.5 * mm))
hook(0.05, 1.49, 0.05)
hook(0.23, 1.49, 0.05)
for k, mat in enumerate((M['red'], M['red'], M['yellow'], M['yellow'], M['blue'], M['blue'])):
    x = 0.045 + k * 0.038
    parts.append(cylinder(f'sd-handle{k}', 0.012, 0.09, (x, PY - 0.035, 1.556), mat, vertices=12))
    parts.append(cylinder(f'sd-shaft{k}', 2.5 * mm, 0.12 - (k % 2) * 0.03, (x, PY - 0.035, 1.45 - (k % 2) * 0.015), M['chrome'], vertices=8))

# A roll of hook-and-loop ties on a peg, bottom right.
hook(0.45, 1.5, 0.08)
parts.append(cylinder('velcro', 0.04, 0.03, (0.45, PY - 0.05, 1.47), M['velcro'], vertices=24, rotate=(math.pi / 2, 0, 0)))
parts.append(cylinder('velcro-core', 0.02, 0.031, (0.45, PY - 0.05, 1.47), M['label'], vertices=16, rotate=(math.pi / 2, 0, 0)))

for o in parts:
    bpy.context.view_layer.objects.active = o
    for sel in bpy.context.selected_objects:
        sel.select_set(False)
    o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

body = c.join(parts, 'ToolWall')
out = c.args()
c.export_glb(out[0])
print('exported', out[0], 'faces', len(body.data.polygons) + len(pegboard.data.polygons))
if len(out) > 1:
    c.preview(out[1], target=(0, -0.2, 1.15), distance=4.6, angle=(-25, 8))
