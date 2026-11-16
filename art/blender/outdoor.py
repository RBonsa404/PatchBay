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
elif kind in ('shop_open', 'shop_closed'):
    # One 4 m bay of a single-storey shop of the city, across the street: rendered blockwork (painted per shop in the
    # game: the 'render' material is white and tinted), a 3 m opening with its roller shutter, a painted sign board
    # over it, and a corrugated sheet awning on two steel posts to shade the pavement.
    render = c.material('render', '#ffffff', 0.93)
    plinth = c.material('plinth', '#5e4c3d', 0.9)
    coping = c.material('coping', '#e6e0d4', 0.75)
    inside = c.material('inside', '#2a2622', 0.95)
    shutter = c.material('shutter', '#8d949b', 0.45, 0.7)
    tole = c.material('tole', '#9aa0a4', 0.5, 0.65)
    rust = c.material('rust', '#7d5234', 0.85, 0.3)
    steel = c.material('post', '#3f464d', 0.5, 0.6)
    board = c.material('board', '#f2efe8', 0.6)
    concrete = c.material('step', '#a9a296', 0.9)
    W, D, H, P = 4.0, 4.0, 3.3, 0.45
    f = -D / 2
    OW, OH = 3.0, 2.5
    # Front wall round the opening, sides, back, roof slab.
    for s in (-1, 1):
        parts.append(c.box(f'pier{s}', ((W - OW) / 2, 0.2, H + P), (s * (W + OW) / 4, f + 0.1, (H + P) / 2), render))
        parts.append(c.box(f'side{s}', (0.2, D, H + P), (s * (W / 2 - 0.1), 0, (H + P) / 2), render))
    parts.append(c.box('lintel', (OW, 0.2, H + P - OH), (0, f + 0.1, OH + (H + P - OH) / 2), render))
    parts.append(c.box('back', (W, 0.2, H + P), (0, D / 2 - 0.1, (H + P) / 2), render))
    parts.append(c.box('slab', (W, D, 0.15), (0, 0, H), render))
    parts.append(c.box('coping', (W + 0.02, 0.26, 0.05), (0, f + 0.11, H + P + 0.025), coping))
    parts.append(c.box('plinth', (W + 0.01, 0.21, 0.32), (0, f + 0.1, 0.16), plinth))
    parts.append(c.box('step', (OW + 0.2, 0.45, 0.14), (0, f - 0.2, 0.07), concrete, bevel=10 * mm))
    # The sign board over the opening (its painting is laid on in the game, 3.6 × 0.62 m, front at f - 0.04).
    parts.append(c.box('board', (3.7, 0.04, 0.7), (0, f - 0.02, H + 0.05), board, bevel=6 * mm))
    # Roller shutter: its housing over the opening, and either the slats down or the shop open with its goods.
    parts.append(c.box('housing', (OW + 0.1, 0.24, 0.26), (0, f - 0.12, OH + 0.13), shutter, bevel=15 * mm, segments=3))
    for s in (-1, 1):
        parts.append(c.box(f'guide{s}', (0.05, 0.06, OH), (s * (OW / 2 + 0.02), f - 0.03, OH / 2), shutter))
    if kind == 'shop_closed':
        for k in range(31):
            parts.append(c.box(f'slat{k}', (OW, 0.03, 0.075), (0, f - 0.03, 0.04 + k * 0.08), shutter, bevel=8 * mm))
        parts.append(c.box('bottom', (OW, 0.05, 0.05), (0, f - 0.04, 0.03), steel))
        parts.append(c.box('lock', (0.06, 0.03, 0.08), (0, f - 0.07, 0.12), c.material('brass', '#b08d3a', 0.35, 1.0)))
    else:
        parts.append(c.box('floor', (W - 0.4, D - 0.4, 0.02), (0, 0, 0.01), concrete))
        parts.append(c.box('dark', (W - 0.42, 0.02, H - 0.1), (0, D / 2 - 0.21, H / 2), inside))
        for s in (-1, 1):
            parts.append(c.box(f'darkside{s}', (0.02, D - 0.4, H - 0.1), (s * (W / 2 - 0.21), 0, H / 2), inside))
        parts.append(c.box('ceiling', (W - 0.4, D - 0.4, 0.02), (0, 0, H - 0.08), inside))
        # Shelves along the back wall, crowded with packets and tins; a counter at the front.
        wood = c.material('shelf', '#6b4a2e', 0.8)
        goods = [c.material(f'goods{i}', col, 0.6) for i, col in enumerate(('#c0392b', '#e9b949', '#1f6fb2', '#2e8b57', '#f3f0e6', '#d35400'))]
        k = 0
        for z in (0.5, 1.05, 1.6, 2.15):
            parts.append(c.box(f'shelf{z}', (W - 0.6, 0.45, 0.03), (0, D / 2 - 0.45, z), wood))
            x = -W / 2 + 0.4
            while x < W / 2 - 0.45:
                w = 0.14 + ((k * 37) % 9) * 0.02
                h = 0.18 + ((k * 53) % 7) * 0.035
                parts.append(c.box(f'item{k}', (w, 0.3, h), (x + w / 2, D / 2 - 0.45, z + 0.015 + h / 2), goods[k % len(goods)]))
                x += w + 0.025
                k += 1
        parts.append(c.box('counter', (2.0, 0.55, 1.0), (0.4, f + 1.3, 0.5), wood, bevel=10 * mm))
        parts.append(c.box('glass', (1.9, 0.5, 0.02), (0.4, f + 1.3, 1.01), c.material('vitrine', '#c9d6dd', 0.1, 0.2)))
        parts.append(c.box('crate', (0.5, 0.35, 0.3), (-1.0, f + 0.7, 0.15), goods[0], bevel=8 * mm))
        parts.append(c.box('crate2', (0.5, 0.35, 0.3), (-1.0, f + 0.7, 0.45), goods[1], bevel=8 * mm))
    # The awning: corrugated sheet sloping from the wall down to its two posts, a rusty edge.
    import bmesh
    mesh = bpy.data.meshes.new('awning')
    bm = bmesh.new()
    AW, AD, waves, top, low = W + 0.1, 1.9, 26, 2.95, 2.62
    cols = waves * 4
    grid = []
    for j in range(2):
        y = f - 0.02 - j * AD
        zb = top if j == 0 else low
        row = []
        for i in range(cols + 1):
            x = -AW / 2 + AW * i / cols
            row.append(bm.verts.new((x, y, zb + 0.018 * math.sin(i / cols * waves * 2 * math.pi))))
        grid.append(row)
    for i in range(cols):
        bm.faces.new((grid[0][i], grid[0][i + 1], grid[1][i + 1], grid[1][i]))
    bm.to_mesh(mesh)
    bm.free()
    awning = bpy.data.objects.new('awning', mesh)
    bpy.context.collection.objects.link(awning)
    awning.data.materials.append(tole)
    mod = awning.modifiers.new('thick', 'SOLIDIFY')
    mod.thickness = 0.006
    c.apply_modifiers(awning)
    parts.append(awning)
    parts.append(c.box('edge', (AW, 0.03, 0.05), (0, f - 0.02 - AD, low - 0.01), rust))
    parts.append(c.box('beam', (AW - 0.1, 0.05, 0.08), (0, f - AD + 0.1, low - 0.06), steel))
    for s in (-1, 1):
        parts.append(cylinder(f'post{s}', 0.03, low - 0.06, (s * (AW / 2 - 0.15), f - AD + 0.1, (low - 0.06) / 2), steel, 12))
elif kind == 'pole':
    # A concrete electricity pole of the town, 9 m, its steel crossarm and three insulators, and a street lamp.
    concrete = c.material('concrete', '#a7a39b', 0.9)
    steel = c.material('steel', '#4b5157', 0.5, 0.7)
    porcelain = c.material('porcelain', '#e8e6df', 0.3)
    lamp = c.material('lamp', '#fff7e0', 0.3, emission='#fff1c8', strength=2)
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.15, radius2=0.09, depth=9.0, location=(0, 0, 4.5))
    shaft = bpy.context.active_object
    shaft.name = 'shaft'
    shaft.data.materials.append(concrete)
    parts.append(shaft)
    # The crossarm runs across the street (along Y, like the lamp's arm); the wires along the street sit on the
    # insulators at y = -0.75, 0, 0.75, 8.73 m up (the game hangs them there).
    parts.append(c.box('arm', (0.08, 1.7, 0.08), (0, 0, 8.55), steel))
    for y in (-0.75, 0, 0.75):
        parts.append(cylinder(f'ins{y}', 0.035, 0.14, (0, y, 8.66), porcelain, 12))
    parts.append(bar('lamparm', (0, -0.1, 7.2), (0, -1.6, 7.6), 0.03, steel))
    parts.append(c.box('head', (0.22, 0.5, 0.1), (0, -1.75, 7.55), steel, bevel=20 * mm, segments=3))
    parts.append(c.box('glow', (0.18, 0.42, 0.01), (0, -1.75, 7.495), lamp))
elif kind == 'tree':
    # A neem, the shade tree of every street of Ouagadougou: a short leaning trunk, four limbs, a broad rounded
    # crown of leaf clumps (lumpy spheres, two greens).
    bark = c.material('bark', '#4a3b2e', 0.95)
    leaf = c.material('leaf', '#4c6a2b', 0.85)
    leaf2 = c.material('leaf2', '#3a5622', 0.85)
    parts.append(bar('trunk', (0, 0, 0), (0.15, 0.05, 2.6), 0.2, bark, 12))
    crown = (0.15, 0.05, 2.6)
    tips = [(1.6, 0.4, 4.6), (-1.4, 0.6, 4.8), (0.3, -1.5, 4.7), (0.1, 1.4, 5.2), (0.2, 0.0, 5.6)]
    for i, t in enumerate(tips):
        parts.append(bar(f'limb{i}', crown, t, 0.11 - i * 0.012, bark, 10))
    for i, (a, b) in enumerate(((tips[0], (2.6, -0.4, 4.9)), (tips[1], (-2.5, 0.2, 5.0)), (tips[2], (-0.6, -2.4, 4.9)), (tips[3], (0.9, 2.4, 5.3)))):
        parts.append(bar(f'twig{i}', a, b, 0.05, bark, 8))
    seed = 11

    def rnd():
        global seed
        seed = (seed * 16807) % 2147483647
        return seed / 2147483647
    # The neem's pinnate leaves, painted into a small picture with its alpha: leaflets either side of a midrib, three
    # leaves per picture. Laid on crossed cards (alpha cut out in the game), the crown reads as foliage, not as balls.
    S = 256
    img = bpy.data.images.new('neem_leaves', S, S, alpha=True)
    px = [0.0] * (S * S * 4)
    greens = ((0.16, 0.27, 0.06), (0.22, 0.34, 0.08), (0.12, 0.21, 0.05))
    for li, (cx0, cy0, ang) in enumerate(((60, 30, 1.25), (150, 40, 1.75), (200, 120, 2.4), (70, 140, 0.9), (130, 150, 1.5))):
        dx, dy = math.cos(ang), math.sin(ang)
        g = greens[li % 3]
        for k in range(9):
            t = 12 + k * 11
            mx, my = cx0 + dx * t, cy0 + dy * t
            for side in (-1, 1):
                la = ang + side * 0.95
                lx, ly = math.cos(la), math.sin(la)
                ex, ey = mx + lx * 13, my + ly * 13
                for yy in range(int(ey - 16), int(ey + 17)):
                    for xx in range(int(ex - 16), int(ex + 17)):
                        if not (0 <= xx < S and 0 <= yy < S):
                            continue
                        u = (xx - ex) * lx + (yy - ey) * ly
                        v = -(xx - ex) * ly + (yy - ey) * lx
                        if (u / 14) ** 2 + (v / 4.5) ** 2 <= 1:
                            i4 = (yy * S + xx) * 4
                            shade = 0.85 + 0.3 * (v / 4.5 + 1) / 2
                            px[i4:i4 + 4] = [g[0] * shade, g[1] * shade, g[2] * shade, 1.0]
    img.pixels = px
    img.file_format = 'PNG'
    img.pack()
    leaves = bpy.data.materials.new('leaves')
    leaves.use_nodes = True
    nodes = leaves.node_tree.nodes
    bsdf = nodes.get('Principled BSDF')
    node = nodes.new('ShaderNodeTexImage')
    node.image = img
    leaves.node_tree.links.new(node.outputs['Color'], bsdf.inputs['Base Color'])
    leaves.node_tree.links.new(node.outputs['Alpha'], bsdf.inputs['Alpha'])
    bsdf.inputs['Roughness'].default_value = 0.75
    # A dark core inside the crown so that the cards never let the sky through as a sieve.
    for i, (x, y, z, r) in enumerate(((0.15, 0.05, 4.9, 1.9), (1.4, 0.3, 4.8, 1.2), (-1.2, 0.4, 4.9, 1.2), (0.2, -1.3, 4.8, 1.2), (0.2, 1.3, 5.1, 1.2))):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=r, location=(x, y, z))
        o = bpy.context.active_object
        o.name = f'core{i}'
        o.scale = (1.0, 1.0, 0.6)
        o.data.materials.append(leaf2)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        parts.append(o)
    # Cards: three crossed quads per tuft, tufts over the shell of a broad, flattened crown.
    import bmesh
    mesh = bpy.data.meshes.new('foliage')
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    for i in range(170):
        a = rnd() * 2 * math.pi
        e = (rnd() - 0.3) * math.pi * 0.5
        shell = 0.7 + rnd() * 0.35
        cx = 0.15 + math.cos(a) * math.cos(e) * 3.0 * shell
        cy = 0.05 + math.sin(a) * math.cos(e) * 3.0 * shell
        cz = 4.95 + math.sin(e) * 1.3 * shell
        size = 0.9 + rnd() * 0.5
        for q in range(3):
            yaw = rnd() * math.pi
            tilt = (rnd() - 0.5) * 1.2
            ux, uy = math.cos(yaw) * size / 2, math.sin(yaw) * size / 2
            vz = math.cos(tilt) * size / 2
            vx, vy = -math.sin(yaw) * math.sin(tilt) * size / 2, math.cos(yaw) * math.sin(tilt) * size / 2
            corners = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
            verts = [bm.verts.new((cx + s * ux + t * vx, cy + s * uy + t * vy, cz + t * vz)) for s, t in corners]
            f = bm.faces.new(verts)
            for loop, (s, t) in zip(f.loops, corners):
                loop[uvl].uv = ((s + 1) / 2, (t + 1) / 2)
    bm.to_mesh(mesh)
    bm.free()
    cards = bpy.data.objects.new('foliage', mesh)
    bpy.context.collection.objects.link(cards)
    cards.data.materials.append(leaves)
    parts.append(cards)
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
    view = {'ac_unit': (0.8, 3.2), 'water_tank': (1.6, 7.5), 'pole': (4.5, 16), 'tree': (3.5, 16), 'shop_open': (1.8, 9), 'shop_closed': (1.8, 9)}.get(kind, (0.8, 7.5))
    c.preview(argv[2], target=(0, 0, view[0]), distance=view[1], angle=(-30, 15))
