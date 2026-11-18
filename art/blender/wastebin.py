"""The office bin beside the technician's desk: a tapered steel bin with a rolled rim, a black liner folded over it and
a few crumpled sheets of paper inside.

    blender --background --factory-startup --python art/blender/wastebin.py -- <out.glb> [preview.png]

Centred, floor at z = 0. 0.30 m across at the top, 0.24 m at the foot, 0.38 m high.
"""
import math
import os
import random
import sys

import bmesh
import bpy

sys.path.append(os.path.dirname(__file__))
import common as c  # noqa: E402

mm = 0.001
R_TOP, R_FOOT, H = 0.15, 0.12, 0.38
c.reset()
random.seed(7)
M = {
    'steel': c.material('steel', '#2c333e', 0.45, 0.6),
    'liner': c.material('liner', '#0b0c0f', 0.35),
    'paper': c.material('paper', '#eef1f4', 0.85),
    'rubber': c.material('rubber', '#0a0b0d', 0.8),
}
parts = []
SEG = 40

# The shell: an open tapered tube with a floor, given a thickness.
mesh = bpy.data.meshes.new('shell')
bm = bmesh.new()
ring_foot = [bm.verts.new((R_FOOT * math.cos(a), R_FOOT * math.sin(a), 0.004)) for a in (2 * math.pi * i / SEG for i in range(SEG))]
ring_top = [bm.verts.new((R_TOP * math.cos(a), R_TOP * math.sin(a), H - 0.006)) for a in (2 * math.pi * i / SEG for i in range(SEG))]
for i in range(SEG):
    j = (i + 1) % SEG
    bm.faces.new((ring_foot[i], ring_foot[j], ring_top[j], ring_top[i]))
bm.faces.new(list(reversed(ring_foot)))
bm.to_mesh(mesh)
bm.free()
shell = bpy.data.objects.new('shell', mesh)
shell.data.materials.append(M['steel'])
bpy.context.collection.objects.link(shell)
mod = shell.modifiers.new('thick', 'SOLIDIFY')
mod.thickness = 1.2 * mm
mod.offset = -1
shell.data.polygons.foreach_set('use_smooth', [True] * len(shell.data.polygons))
parts.append(shell)

# The rolled rim, and a rubber foot ring.
bpy.ops.mesh.primitive_torus_add(major_segments=SEG, minor_segments=8, major_radius=R_TOP, minor_radius=4 * mm, location=(0, 0, H - 0.004))
rim = bpy.context.active_object
rim.data.materials.append(M['steel'])
rim.data.polygons.foreach_set('use_smooth', [True] * len(rim.data.polygons))
parts.append(rim)
bpy.ops.mesh.primitive_torus_add(major_segments=SEG, minor_segments=6, major_radius=R_FOOT - 0.004, minor_radius=4 * mm, location=(0, 0, 0.004))
foot = bpy.context.active_object
foot.data.materials.append(M['rubber'])
parts.append(foot)

# The liner folded over the rim: a short wavy skirt hanging outside, its inside lining the bin.
mesh = bpy.data.meshes.new('liner')
bm = bmesh.new()
rows = []
for k, (r, z) in enumerate(((R_TOP - 0.004, H - 0.12), (R_TOP - 0.002, H - 0.004), (R_TOP + 0.007, H + 0.002), (R_TOP + 0.009, H - 0.05))):
    row = []
    for i in range(SEG):
        a = 2 * math.pi * i / SEG
        wave = (0.0015 * math.sin(a * 7 + k) if k >= 2 else 0) + (0.003 * math.sin(a * 3) if k == 3 else 0)
        row.append(bm.verts.new(((r + wave) * math.cos(a), (r + wave) * math.sin(a), z + (0.008 * math.sin(a * 5) if k == 3 else 0))))
    rows.append(row)
for a, b in zip(rows, rows[1:]):
    for i in range(SEG):
        j = (i + 1) % SEG
        bm.faces.new((a[i], a[j], b[j], b[i]))
bm.to_mesh(mesh)
bm.free()
liner = bpy.data.objects.new('liner', mesh)
liner.data.materials.append(M['liner'])
bpy.context.collection.objects.link(liner)
mod = liner.modifiers.new('thick', 'SOLIDIFY')
mod.thickness = 0.6 * mm
liner.data.polygons.foreach_set('use_smooth', [True] * len(liner.data.polygons))
parts.append(liner)

# Crumpled sheets, near the top so that they show over the rim.
for i, (x, y, z, r) in enumerate(((0.03, 0.02, H - 0.09, 0.045), (-0.05, -0.03, H - 0.1, 0.04), (0.0, -0.06, H - 0.12, 0.038), (-0.02, 0.06, H - 0.11, 0.035))):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=r, location=(x, y, z))
    ball = bpy.context.active_object
    for v in ball.data.vertices:
        v.co *= 0.78 + random.random() * 0.4
    ball.data.materials.append(M['paper'])
    parts.append(ball)

body = c.join(parts, 'Wastebin')
out = c.args()
c.export_glb(out[0])
print('exported', out[0], 'faces', len(body.data.polygons))
if len(out) > 1:
    c.preview(out[1], target=(0, 0, 0.2), distance=1.4, angle=(-30, 30))
