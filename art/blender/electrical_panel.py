"""The technical room's electrical panel (tableau électrique) on the left wall: a light-grey steel wall box, its door with
a window onto two rows of breakers on DIN rails (residual-current devices at the head of each group), a strip of
circuit labels, hinges on the left, a quarter-turn lock, the yellow « danger électrique » plate, and the two conduits
going up to the ceiling through their glands.

    blender --background --factory-startup --python art/blender/electrical_panel.py -- <out.glb> [preview.png]

Centred, base at z = 0, front at y = -D/2 (+Z in the game). 0.56 x 0.10 m, 0.80 m high; the conduits rise 0.75 m above.
"""
import math
import os
import sys

import bpy

sys.path.append(os.path.dirname(__file__))
import common as c  # noqa: E402

mm = 0.001
W, D, H = 0.56, 0.10, 0.80
FRONT = -D / 2
c.reset()
M = {
    'box': c.material('box', '#c4c8cc', 0.5, 0.35),
    'inside': c.material('inside', '#9aa1a8', 0.6, 0.3),
    'gasket': c.material('gasket', '#111316', 0.8),
    'breaker': c.material('breaker', '#eceef0', 0.45),
    'toggle': c.material('toggle', '#2b2f36', 0.4),
    'rcd': c.material('rcd', '#1d4ed8', 0.4),
    'test': c.material('test', '#fbbf24', 0.4),
    'rail': c.material('rail', '#aeb6bf', 0.32, 0.9),
    'label': c.material('label', '#f8fafc', 0.8),
    'ink': c.material('ink', '#0b0f17', 0.6),
    'yellow': c.material('yellow', '#facc15', 0.5),
    'chrome': c.material('chrome', '#cbd5e1', 0.25, 1.0),
    'pvc': c.material('pvc', '#d4d7db', 0.55),
    'gland': c.material('gland', '#3a3f47', 0.6),
}
parts = []


def cylinder(name, radius, depth, at, mat, vertices=24, rotate=(math.pi / 2, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=at, rotation=rotate)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


# The box: a back shell, its rim, and the door set 2 mm proud of the rim.
parts.append(c.box('shell', (W, 0.07, H), (0, 0.015, H / 2), M['box'], bevel=4 * mm))
parts.append(c.box('mount', (W - 0.03, 2 * mm, H - 0.03), (0, -0.021, H / 2), M['inside']))
RIM = 0.016
for name, size, at in (
    ('rim-top', (W, 0.03, RIM), (0, -0.035, H - RIM / 2)),
    ('rim-bottom', (W, 0.03, RIM), (0, -0.035, RIM / 2)),
    ('rim-left', (RIM, 0.03, H), (-W / 2 + RIM / 2, -0.035, H / 2)),
    ('rim-right', (RIM, 0.03, H), (W / 2 - RIM / 2, -0.035, H / 2)),
):
    parts.append(c.box(name, size, at, M['box'], bevel=2 * mm))
# The door, in four pieces around its window (x within +-0.21 m, z from 0.38 to 0.70 m).
DY = FRONT - 2 * mm
OX, OZ0, OZ1 = 0.21, 0.38, 0.70
for name, (x0, x1, z0, z1) in {
    'door-top': (-W / 2 + 3 * mm, W / 2 - 3 * mm, OZ1, H - 4 * mm),
    'door-bottom': (-W / 2 + 3 * mm, W / 2 - 3 * mm, 4 * mm, OZ0),
    'door-left': (-W / 2 + 3 * mm, -OX, OZ0, OZ1),
    'door-right': (OX, W / 2 - 3 * mm, OZ0, OZ1),
}.items():
    parts.append(c.box(name, (x1 - x0, 3 * mm, z1 - z0), ((x0 + x1) / 2, DY, (z0 + z1) / 2), M['box'], bevel=1 * mm))
for name, size, at in (
    ('gasket-top', (2 * OX + 8 * mm, 4 * mm, 5 * mm), (0, DY - 1 * mm, OZ1)),
    ('gasket-bottom', (2 * OX + 8 * mm, 4 * mm, 5 * mm), (0, DY - 1 * mm, OZ0)),
    ('gasket-left', (5 * mm, 4 * mm, OZ1 - OZ0), (-OX, DY - 1 * mm, (OZ0 + OZ1) / 2)),
    ('gasket-right', (5 * mm, 4 * mm, OZ1 - OZ0), (OX, DY - 1 * mm, (OZ0 + OZ1) / 2)),
):
    parts.append(c.box(name, size, at, M['gasket'], bevel=1.5 * mm))

# Two rows of nine 2-module breakers on their DIN rails; a residual-current device heads each group of four.
for row, zc in enumerate((0.61, 0.47)):
    parts.append(c.box(f'rail{row}', (0.4, 7 * mm, 0.035), (0, -0.0235, zc), M['rail']))
    for i in range(9):
        x = 0.148 - i * 0.037
        rcd = row == 0 and i % 4 == 0
        parts.append(c.box(f'brk{row}-{i}', (0.035, 0.022, 0.085), (x, -0.036, zc), M['breaker'], bevel=1.5 * mm))
        parts.append(c.box(f'neck{row}-{i}', (0.035, 0.008, 0.045), (x, -0.049, zc), M['breaker'], bevel=1 * mm))
        on = (row + i) % 7 != 5
        toggle = c.box(f'tog{row}-{i}', (0.012 if not rcd else 0.024, 0.012, 0.009), (x, -0.056, zc + (0.007 if on else -0.007)), M['rcd'] if rcd else M['toggle'], bevel=1.2 * mm)
        toggle.rotation_euler = (math.radians(-25 if on else 25), 0, 0)
        parts.append(toggle)
        if rcd:
            parts.append(c.box(f'test{row}-{i}', (6 * mm, 3 * mm, 6 * mm), (x + 0.01, -0.0535, zc - 0.03), M['test'], bevel=1 * mm))
        # A circuit label under each breaker.
        parts.append(c.box(f'lbl{row}-{i}', (0.03, 1 * mm, 0.01), (x, -0.0475, zc - 0.051), M['label']))
    parts.append(c.box(f'cover{row}', (0.4, 3 * mm, 0.018), (0, -0.046, zc + 0.052), M['inside'], bevel=1 * mm))
parts.append(c.text('circuits', 'ÉCLAIRAGE · PRISES · BAIES · CLIM', 0.0085, (0, -0.0482, 0.5355), M['ink'], resolution=2))

# Hinges on the left, a quarter-turn lock on the right.
for z in (0.12, 0.68):
    parts.append(cylinder(f'hinge{z}', 5 * mm, 0.05, (-W / 2 - 1 * mm, FRONT - 1 * mm, z), M['chrome'], 16, rotate=(0, 0, 0)))
parts.append(cylinder('lock', 0.012, 6 * mm, (0.235, DY - 3 * mm, 0.42), M['chrome'], 32))
parts.append(c.box('lock-slot', (0.016, 2 * mm, 3 * mm), (0.235, DY - 6.2 * mm, 0.42), M['gasket']))

# The danger plate: a black-edged yellow triangle with its lightning bolt, the words under it.
PY = DY - 1.8 * mm
parts.append(c.box('plate', (0.2, 1 * mm, 0.17), (0, PY, 0.2), M['yellow'], bevel=0.5 * mm))
parts.append(cylinder('tri-edge', 0.042, 0.8 * mm, (0, PY - 0.6 * mm, 0.235), M['ink'], 3, rotate=(math.pi / 2, -math.pi / 2, 0)))
parts.append(cylinder('tri-fill', 0.032, 0.8 * mm, (0, PY - 1.1 * mm, 0.232), M['yellow'], 3, rotate=(math.pi / 2, -math.pi / 2, 0)))
BOLT = [(0.004, 0.014), (-0.006, -0.001), (0.0, -0.001), (-0.004, -0.014), (0.006, 0.001), (0.0, 0.001)]
mesh = bpy.data.meshes.new('bolt')
mesh.from_pydata([(x, PY - 1.7 * mm, 0.229 + z) for x, z in BOLT], [], [list(range(len(BOLT)))])
bolt = bpy.data.objects.new('bolt', mesh)
bolt.data.materials.append(M['ink'])
bpy.context.collection.objects.link(bolt)
parts.append(bolt)
parts.append(c.text('danger', 'DANGER', 0.026, (0, PY - 0.7 * mm, 0.165), M['ink'], resolution=3))
parts.append(c.text('electrique', 'ÉLECTRIQUE', 0.018, (0, PY - 0.7 * mm, 0.135), M['ink'], resolution=3))

# The conduits to the ceiling, each through a gland on the top of the box.
for x in (0.13, -0.12):
    parts.append(cylinder(f'gland{x}', 0.024, 0.02, (x, 0.012, H + 0.01), M['gland'], 6, rotate=(0, 0, 0)))
    parts.append(cylinder(f'conduit{x}', 0.018, 0.75, (x, 0.012, H + 0.02 + 0.375), M['pvc'], 24, rotate=(0, 0, 0)))
    for z in (0.35, 0.7):
        parts.append(c.box(f'clip{x}{z}', (0.044, 0.02, 0.018), (x, 0.03, H + z), M['pvc'], bevel=3 * mm))

for o in parts:
    bpy.context.view_layer.objects.active = o
    for sel in bpy.context.selected_objects:
        sel.select_set(False)
    o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

body = c.join(parts, 'ElectricalPanel')
out = c.args()
c.export_glb(out[0])
print('exported', out[0], 'faces', len(body.data.polygons))
if len(out) > 1:
    c.preview(out[1], target=(0, FRONT, 0.5), distance=1.9, angle=(-25, 6))
