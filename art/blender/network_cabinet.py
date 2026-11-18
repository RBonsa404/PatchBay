"""A closed 42U network cabinet, 600 mm wide, as they stand bayed in rows in a network room: powder-coated steel on a
ventilated plinth, flush side panels with their lock and recessed grips, a roof with brush cable entries, perforated
front and rear doors (a hexagonal hole pattern, cut out by the picture's alpha, so that the equipment shows through),
a swing handle with its lock, hinges, a blank band on the door's top for the bay's name plate (drawn by the game).
Behind the front door: a brush panel, two 24-port patch panels cabled to two 48-port switches through horizontal cable
managers, 1U servers, blanking panels, a 2U UPS at the bottom, every LED lit. Behind the rear door: the equipment's
backs and two vertical power strips.

    blender --background --factory-startup --python art/blender/network_cabinet.py -- <out.glb> <depth> [preview.png]

Centred, floor at z = 0, front at y = -D/2 (+Z in the game). 0.60 m wide, 2.00 m high, `depth` deep (0.9 for a row in
the middle of a room, 0.65 against a wall, where there is no rear door but a solid back).
"""
import math
import os
import sys

import bmesh
import bpy

sys.path.append(os.path.dirname(__file__))
import common as c  # noqa: E402

mm = 0.001
out = c.args()
W, H = 0.60, 2.00
D = float(out[1]) if len(out) > 1 else 0.9
REAR_DOOR = D > 0.8
FRONT, BACK = -D / 2, D / 2
c.reset()
M = {
    'body': c.material('body', '#262b33', 0.55, 0.45),
    'plinth': c.material('plinth', '#121519', 0.7, 0.3),
    'inside': c.material('inside', '#07090c', 0.85, 0.2),
    'rail': c.material('rail', '#a9b2bc', 0.38, 0.85),
    'gear': c.material('gear', '#1c222b', 0.42, 0.6),
    'blank': c.material('blank', '#15191f', 0.6, 0.35),
    'port': c.material('port', '#020304', 0.9),
    'chrome': c.material('chrome', '#c4ccd6', 0.25, 1.0),
    'print': c.material('print', '#e2e8f0', 0.5),
    'blue': c.material('cord-blue', '#2563eb', 0.45),
    'yellow': c.material('cord-yellow', '#eab308', 0.45),
    'green': c.material('green', '#22c55e', 0.3, emission='#22c55e', strength=6),
    'amber': c.material('amber', '#fbbf24', 0.3, emission='#fbbf24', strength=6),
    'cyan': c.material('cyan', '#38bdf8', 0.3, emission='#38bdf8', strength=4),
}
parts = []


def perforated():
    """Perforated steel: dark powder-coated sheet with a staggered grid of round holes, about half open. The holes are
    the picture's alpha (the game cuts them out); 256 pixels hold 32 x 32 holes at an 8 mm pitch."""
    size, pitch, radius = 256, 8, 3.0
    img = bpy.data.images.new('perforated', size, size, alpha=True)
    px = [0.0] * (size * size * 4)
    sheet = c.srgb('#353c47')
    for y in range(size):
        row = (y + pitch // 2) // pitch
        cy = row * pitch
        for x in range(size):
            shift = (row % 2) * pitch / 2
            cx = round((x + 0.5 - shift - pitch / 2) / pitch) * pitch + shift + pitch / 2
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            # A soft edge over one pixel: the cut-out stays smooth when the picture is filtered.
            a = min(1.0, max(0.0, d - radius + 0.5))
            i = (y * size + x) * 4
            px[i:i + 4] = [sheet[0], sheet[1], sheet[2], a]
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
    bsdf.inputs['Roughness'].default_value = 0.55
    bsdf.inputs['Metallic'].default_value = 0.45
    return m


M['perforated'] = perforated()


def sheet(name, x0, x1, z0, z1, y, facing):
    """A flat perforated sheet in the XZ plane at depth `y`, its UVs at the real hole pitch (0.256 m per picture)."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    corners = [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]
    if facing > 0:
        corners.reverse()
    face = bm.faces.new([bm.verts.new((x, y, z)) for x, z in corners])
    for loop in face.loops:
        co = loop.vert.co
        loop[uv].uv = (co.x / 0.256, co.z / 0.256)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(M['perforated'])
    bpy.context.collection.objects.link(obj)
    return obj


def cylinder(name, radius, depth, at, mat, vertices=16, rotate=(math.pi / 2, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=at, rotation=rotate)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


# The carcass: plinth with vent slots, two side panels with a flush lock and grips, roof with brush entries.
PLINTH = 0.08
parts.append(c.box('plinth', (W - 0.01, D - 0.02, PLINTH), (0, 0, PLINTH / 2), M['plinth'], bevel=1.5 * mm, segments=1))
for side in (FRONT + 0.0095, BACK - 0.0095):
    for i in range(6):
        parts.append(c.box(f'plinth-vent{side}{i}', (0.06, 2 * mm, 0.025), (-0.19 + i * 0.076, side - 0.001 * math.copysign(1, side), PLINTH / 2), M['port'], bevel=3 * mm, segments=1))
for s in (-1, 1):
    x = s * (W / 2 - 0.0075)
    parts.append(c.box(f'side{s}', (0.015, D - 0.05, H - PLINTH - 0.04), (x, 0, PLINTH + (H - PLINTH - 0.04) / 2), M['body'], bevel=2 * mm, segments=2))
    parts.append(cylinder(f'side-lock{s}', 7 * mm, 3 * mm, (s * (W / 2 + 0.0005), BACK - 0.08, H - 0.25), M['chrome'], 20, rotate=(0, math.pi / 2, 0)))
    for z in (0.35, H - 0.35):
        parts.append(c.box(f'side-grip{s}{z}', (2 * mm, 0.12, 0.03), (s * (W / 2 + 0.0005), 0, z), M['port'], bevel=8 * mm, segments=3))
parts.append(c.box('roof', (W, D, 0.04), (0, 0, H - 0.02), M['body'], bevel=3 * mm, segments=2))
for y in (FRONT + 0.12, BACK - 0.12):
    parts.append(c.box(f'brush{y}', (0.36, 0.05, 1.5 * mm), (0, y, H + 0.0004), M['port'], bevel=4 * mm, segments=1))
for i in range(2):
    parts.append(cylinder(f'fan{i}', 0.06, 1.5 * mm, (-0.12 + i * 0.24, 0, H + 0.0004), M['port'], 32, rotate=(0, 0, 0)))
    parts.append(cylinder(f'fan-hub{i}', 0.02, 2.5 * mm, (-0.12 + i * 0.24, 0, H + 0.0008), M['gear'], 20, rotate=(0, 0, 0)))

# Inside: the dark volume, the four rails (front pair seen through the door).
IN_Y0, IN_Y1 = FRONT + 0.06, BACK - (0.06 if REAR_DOOR else 0.02)
parts.append(c.box('inside-floor', (W - 0.03, D - 0.04, 0.005), (0, 0, PLINTH + 0.0025), M['inside']))
if not REAR_DOOR:
    parts.append(c.box('back', (W - 0.03, 0.012, H - PLINTH - 0.04), (0, BACK - 0.006, PLINTH + (H - PLINTH - 0.04) / 2), M['body'], bevel=1.5 * mm, segments=1))
for s in (-1, 1):
    for y in (IN_Y0, IN_Y1):
        parts.append(c.box(f'rail{s}{y}', (0.03, 2 * mm, H - PLINTH - 0.08), (s * 0.24, y, PLINTH + (H - PLINTH - 0.08) / 2 + 0.01), M['rail']))

# The equipment, unit by unit from the top. U = 44.45 mm; the first unit starts just under the roof.
U = 0.04445
TOP = H - 0.06
GY = IN_Y0 - 0.002  # the equipment's front plane, just proud of the rails


def unit(n):
    """The centre height of unit `n` counted from the top (0 = the highest)."""
    return TOP - (n + 0.5) * U


def faceplate(name, n, height, mat, depth=0.02):
    z = unit(n) - (height - 1) * U / 2
    parts.append(c.box(name, (0.482, depth, height * U - 1.2 * mm), (0, GY + depth / 2, z), mat, bevel=1 * mm, segments=1))
    return z


def blank(n, height=1):
    z = faceplate(f'blank{n}', n, height, M['blank'], 3 * mm)
    for k in range(height * 2):
        parts.append(c.box(f'rib{n}{k}', (0.42, 1 * mm, 2 * mm), (0, GY - 0.0005, z - (height - 1) * U / 2 + (k - 0.5) * U / 2), M['gear']))


def ports(n, count, x0, pitch, z, prefix):
    for k in range(count):
        row = k // (count // 2) if count > 24 else 0
        col = k % (count // 2) if count > 24 else k
        x = x0 + col * pitch + (col // 6) * 0.008
        zz = z + (0.009 - row * 0.018 if count > 24 else 0)
        parts.append(c.box(f'{prefix}{n}-{k}', (0.0115, 2 * mm, 0.0095), (x, GY - 0.0005, zz), M['port']))
        yield k, x, zz


def cord(name, x, z_from, z_to, mat):
    """A patch cord: the boot plugged in the port, the cable dropping into the cable manager below."""
    parts.append(c.box(f'{name}-boot', (0.011, 0.024, 0.011), (x, GY - 0.012, z_from), mat, bevel=2 * mm, segments=1))
    length = z_from - z_to
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=2.6 * mm, depth=length, location=(x, GY - 0.026, (z_from + z_to) / 2))
    wire = bpy.context.active_object
    wire.name = f'{name}-wire'
    wire.data.materials.append(mat)
    parts.append(wire)


def patch_panel(n):
    z = faceplate(f'patch{n}', n, 1, M['gear'], 0.012)
    for k, x, zz in ports(n, 24, -0.2, 0.0165, z, 'pp'):
        if k % 5 != 3:
            cord(f'pp-cord{n}-{k}', x, zz, unit(n + 1), M['yellow'] if k in (0, 1, 12) else M['blue'])
    parts.append(c.box(f'patch-label{n}', (0.45, 0.5 * mm, 5 * mm), (0, GY - 0.0008, z + 0.016), M['print']))


def manager(n):
    z = faceplate(f'mgr{n}', n, 1, M['gear'], 0.04)
    for k in range(5):
        parts.append(c.box(f'ring{n}{k}', (6 * mm, 0.05, 0.03), (-0.2 + k * 0.1, GY - 0.02, z), M['gear'], bevel=2 * mm, segments=1))


def switch(n):
    z = faceplate(f'sw{n}', n, 1, M['gear'], 0.015)
    for k, x, zz in ports(n, 48, -0.205, 0.0145, z, 'swp'):
        if k % 5 != 3:
            parts.append(c.box(f'sw-led{n}-{k}', (2 * mm, 0.6 * mm, 1.5 * mm), (x + 0.004, GY - 0.0012, zz + 0.006), M['amber'] if k % 11 == 0 else M['green']))
    for k, x in enumerate((0.19, 0.205, 0.22)):
        parts.append(c.box(f'sw-sfp{n}-{k}', (0.012, 2 * mm, 0.009), (x, GY - 0.0005, z), M['port']))
    parts.append(c.box(f'sw-sys{n}', (3 * mm, 0.6 * mm, 3 * mm), (-0.225, GY - 0.0012, z + 0.008), M['green']))


def server(n):
    z = faceplate(f'srv{n}', n, 1, M['gear'], 0.02)
    for k in range(4):
        parts.append(c.box(f'srv-bay{n}{k}', (0.07, 1.5 * mm, 0.034), (-0.17 + k * 0.075, GY - 0.0005, z), M['blank'], bevel=0.8 * mm, segments=1))
        parts.append(c.box(f'srv-bay-led{n}{k}', (2 * mm, 0.6 * mm, 2 * mm), (-0.14 + k * 0.075, GY - 0.0012, z + 0.011), M['green']))
    parts.append(c.box(f'srv-vent{n}', (0.12, 1 * mm, 0.026), (0.15, GY - 0.0003, z), M['port']))
    parts.append(cylinder(f'srv-power{n}', 3 * mm, 1.5 * mm, (0.225, GY - 0.001, z), M['chrome'], 12))
    parts.append(c.box(f'srv-led{n}', (2 * mm, 0.6 * mm, 2 * mm), (0.225, GY - 0.0012, z + 0.011), M['cyan']))


def ups(n):
    z = faceplate(f'ups{n}', n, 2, M['gear'], 0.03)
    for k in range(10):
        parts.append(c.box(f'ups-vent{n}{k}', (0.018, 1 * mm, 0.06), (-0.2 + k * 0.025, GY - 0.0003, z), M['port'], bevel=0.5 * mm, segments=1))
    parts.append(c.box(f'ups-screen{n}', (0.06, 1 * mm, 0.025), (0.12, GY - 0.0006, z + 0.01), M['cyan']))
    for k, mat in enumerate((M['green'], M['green'], M['amber'])):
        parts.append(c.box(f'ups-led{n}{k}', (3 * mm, 0.6 * mm, 3 * mm), (0.1 + k * 0.015, GY - 0.0012, z - 0.022), mat))
    parts.append(cylinder(f'ups-power{n}', 5 * mm, 2 * mm, (0.2, GY - 0.001, z), M['chrome'], 16))


layout = [('brush', 1), ('patch', 1), ('mgr', 1), ('switch', 1), ('blank', 1), ('patch', 1), ('mgr', 1), ('switch', 1), ('blank', 2)]
layout += [('server', 1)] * 4 + [('blank', 1)] + [('server', 1)] * 2 + [('blank', 2)] * 9 + [('blank', 1)] + [('ups', 2)]
n = 0
for kind, size in layout:
    if kind == 'brush':
        faceplate('brush', n, 1, M['gear'], 3 * mm)
        parts.append(c.box('brush-slot', (0.42, 1 * mm, 0.014), (0, GY - 0.0005, unit(n)), M['port'], bevel=5 * mm, segments=1))
    elif kind == 'patch':
        patch_panel(n)
    elif kind == 'mgr':
        manager(n)
    elif kind == 'switch':
        switch(n)
    elif kind == 'server':
        server(n)
    elif kind == 'ups':
        ups(n)
    else:
        blank(n, size)
    n += size
assert n <= 42, n

# The backs: a dark plane of chassis, and two vertical power strips with their meters, seen through the rear door.
if REAR_DOOR:
    parts.append(c.box('backs', (0.48, 0.01, TOP - PLINTH - 0.04), (0, IN_Y1 - 0.12, PLINTH + 0.02 + (TOP - PLINTH - 0.04) / 2), M['gear']))
    for s in (-1, 1):
        x = s * 0.2
        parts.append(c.box(f'pdu{s}', (0.05, 0.04, 1.7), (x, IN_Y1 - 0.03, PLINTH + 0.9), M['gear'], bevel=2 * mm, segments=1))
        for k in range(16):
            parts.append(c.box(f'pdu-socket{s}{k}', (0.03, 1 * mm, 0.026), (x, IN_Y1 - 0.0095, PLINTH + 0.2 + k * 0.085), M['port'], bevel=3 * mm, segments=1))
        parts.append(c.box(f'pdu-meter{s}', (0.028, 1 * mm, 0.016), (x, IN_Y1 - 0.0095, PLINTH + 1.65), M['green']))

# The doors: a folded frame around the perforated sheet, a top band left blank for the name plate, hinges on the left,
# a swing handle and its lock on the right.
DOOR_T = 0.02
door_bottom, door_top = PLINTH + 0.004, H - 0.044
opening = (0.255, PLINTH + 0.05, H - 0.16)


def door(y, facing, with_band):
    s = facing  # -1: the front, +1: the rear
    top = opening[2] if with_band else H - 0.09
    parts.append(c.box(f'door-l{y}', (W / 2 - opening[0], DOOR_T, door_top - door_bottom), (-(W / 2 + opening[0]) / 2, y, (door_top + door_bottom) / 2), M['body'], bevel=2 * mm, segments=1))
    parts.append(c.box(f'door-r{y}', (W / 2 - opening[0], DOOR_T, door_top - door_bottom), ((W / 2 + opening[0]) / 2, y, (door_top + door_bottom) / 2), M['body'], bevel=2 * mm, segments=1))
    parts.append(c.box(f'door-b{y}', (2 * opening[0] + 0.002, DOOR_T, opening[1] - door_bottom), (0, y, (opening[1] + door_bottom) / 2), M['body'], bevel=2 * mm, segments=1))
    parts.append(c.box(f'door-t{y}', (2 * opening[0] + 0.002, DOOR_T, door_top - top), (0, y, (top + door_top) / 2), M['body'], bevel=2 * mm, segments=1))
    parts.append(sheet(f'mesh{y}', -opening[0] - 0.001, opening[0] + 0.001, opening[1] - 0.001, top + 0.001, y + s * 0.004, s))
    # Swing handle on the right (seen from in front of that door), hinges on the other side.
    hx = s * -(W / 2 - 0.022)
    face = y + s * (DOOR_T / 2)
    parts.append(c.box(f'handle-base{y}', (0.03, 6 * mm, 0.17), (hx, face + s * 0.003, H * 0.52), M['gear'], bevel=4 * mm, segments=2))
    parts.append(c.box(f'handle-lever{y}', (0.014, 0.012, 0.13), (hx, face + s * 0.011, H * 0.52 - 0.008), M['chrome'], bevel=5 * mm, segments=2))
    parts.append(cylinder(f'lock{y}', 6 * mm, 4 * mm, (hx, face + s * 0.0055, H * 0.52 + 0.067), M['chrome'], 20))
    for z in (0.3, H / 2, H - 0.3):
        parts.append(cylinder(f'hinge{y}{z}', 6 * mm, 0.05, (-hx + s * 0.0, y + s * 0.004, z), M['rail'], 16, rotate=(0, 0, 0)))
    for i in range(8):
        parts.append(c.box(f'door-vent{y}{i}', (0.03, 1 * mm, 6 * mm), (-0.18 + i * 0.05, face + s * 0.0005, PLINTH + 0.025), M['port'], bevel=3 * mm, segments=1))


door(FRONT - DOOR_T / 2, -1, True)
if REAR_DOOR:
    door(BACK + DOOR_T / 2, 1, False)

for o in parts:
    bpy.context.view_layer.objects.active = o
    for sel in bpy.context.selected_objects:
        sel.select_set(False)
    o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

body = c.join(parts, 'NetworkCabinet')
c.export_glb(out[0])
print('exported', out[0], 'faces', len(body.data.polygons))
if len(out) > 2:
    c.preview(out[2], target=(0, FRONT, 1.1), distance=6.0, angle=(-28, 14))
