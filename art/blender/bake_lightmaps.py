"""Step 2 of the light bake: Cycles computes the light of every still part of the building. Run by Blender:

    blender --background --factory-startup --python art/blender/bake_lightmaps.py -- art/bake/scene.json art/bake [parts] [size] [samples]

Input: the scene exported by the game (tools/bake/export.cjs), in the game's own coordinates (Y up, metres). The light
comes from where the game draws it: the LED panels of the ceilings and the windows glow, and the machines' coloured
glows are small lamps. Each part gets its own texture of light; the coordinates of its meshes in that texture are
written in the game's vertex order, so that the game only has to add them to its meshes.

Two panels per room stay real-time in the game (they cast the shadows of the equipment the player moves): their
direct light is baked a second time on its own and taken away, so it is not counted twice; their bounced light stays.

Output, in the output folder: <part>.raw (RGB bytes, bottom row first, light encoded as sRGB), <part>.bin (two
16-bit coordinates per vertex), and bake.json (scale of each texture, meshes, offsets).
"""
import base64
import json
import math
import os
import sys
import time

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from common import args, reset  # noqa: E402

PARTS = ['technical-room', 'part-lab', 'part-lower', 'part-stairs', 'part-office', 'part-upper', 'part-west', 'part-classes', 'part-agence', 'part-datacenter', 'part-agence-wing', 'part-datacenter-wing']
SIZES = {'technical-room': 2048, 'part-lab': 2048, 'part-office': 2048, 'part-lower': 1024, 'part-stairs': 1024, 'part-upper': 1024, 'part-west': 2048, 'part-classes': 2048, 'part-agence': 2048, 'part-datacenter': 2048, 'part-agence-wing': 2048, 'part-datacenter-wing': 2048}
# Radiance of a ceiling panel: chosen so that the panel over the bench lights it as the game's key light does.
PANEL = 53.0
# Daylight through a window, times the colour of the picture outside.
WINDOW = 8.0
# The panels' colour: the warm white of the game's ceiling lights.
WARM = (1.0, 0.93, 0.84)
# The game's real-time panels in each room, over the bench (x, z relative to the room) and where each room is (y, z).
REALTIME = [(0.4, 0.6), (0.4, 2.4)]
ROOMS = {'technical-room': (0.0, 0.0), 'part-lab': (0.0, -7.0), 'part-office': (3.3, 0.0)}


def gpu(scene):
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for kind in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI'):
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
            found = [d for d in prefs.devices if d.type == kind]
            if found:
                for d in prefs.devices:
                    d.use = d.type == kind
                scene.cycles.device = 'GPU'
                print('bake on', kind, [d.name for d in found])
                return
        except TypeError:
            continue
    print('bake on CPU')


def floats(text, size):
    return np.frombuffer(base64.b64decode(text), dtype=np.float32).reshape(-1, size)


def place(positions, normals, matrix):
    m = np.array(matrix, dtype=np.float64).reshape(4, 4).T
    world = positions @ m[:3, :3].T + m[:3, 3]
    nworld = normals @ np.linalg.inv(m[:3, :3]).T
    nworld /= np.maximum(np.linalg.norm(nworld, axis=1, keepdims=True), 1e-9)
    return world, nworld


def build(name, positions, normals, matrix=None):
    """A mesh in the game's vertex order: corner i of the mesh is vertex i of the game, but vertices at the same place
    are shared, so that the unwrapping sees whole surfaces rather than loose triangles."""
    world, nworld = place(positions, normals, matrix) if matrix is not None else (positions, normals)
    keys = np.round(world * 2000).astype(np.int64)
    _, first, inverse = np.unique(keys, axis=0, return_index=True, return_inverse=True)
    inverse = inverse.reshape(-1)
    tris = inverse.reshape(-1, 3)
    verts = world[first].tolist()
    # A triangle squashed to a line or a point keeps its own corners, or Blender would drop it and shift the order.
    bad = (tris[:, 0] == tris[:, 1]) | (tris[:, 1] == tris[:, 2]) | (tris[:, 0] == tris[:, 2])
    for t in np.nonzero(bad)[0]:
        base = len(verts)
        verts.extend(world[t * 3:t * 3 + 3].tolist())
        tris[t] = [base, base + 1, base + 2]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], tris.tolist())
    assert len(mesh.loops) == len(positions), name
    try:
        mesh.normals_split_custom_set([tuple(n) for n in nworld])
    except (AttributeError, RuntimeError, TypeError):
        pass
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj['detail'] = detail_factor(np.array(verts), tris)
    return obj


def detail_factor(verts, tris):
    """For each triangle, how much texture its object deserves: a screw, a handle or a cable-manager finger needs far
    less than a wall, and each small piece would otherwise cost as much margin in the texture as a large one."""
    parent = np.arange(len(verts))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for a, b, c in tris:
        ra, rb, rc = find(a), find(b), find(c)
        parent[rb] = ra
        parent[find(rc)] = ra
    roots = np.array([find(t[0]) for t in tris])
    e1 = verts[tris[:, 1]] - verts[tris[:, 0]]
    e2 = verts[tris[:, 2]] - verts[tris[:, 0]]
    area = np.linalg.norm(np.cross(e1, e2), axis=1) / 2
    _, groups = np.unique(roots, return_inverse=True)
    total = np.bincount(groups.reshape(-1), weights=area)[groups.reshape(-1)]
    # Full density from a quarter of a square metre, a tenth of it for objects of a few square centimetres.
    return np.clip(np.sqrt(total / 0.25), 0.1, 1.0).tolist()


def surface(name, albedo, image=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes = m.node_tree.nodes
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*albedo, 1)
    bsdf.inputs['Roughness'].default_value = 1.0
    if image is not None:
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = image
        nodes.active = tex
    return m


def glow(name, colour, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes = m.node_tree.nodes
    for n in list(nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nodes.remove(n)
    emit = nodes.new('ShaderNodeEmission')
    emit.inputs['Color'].default_value = (*colour, 1)
    # One-sided, like a real panel: its back would light the frame it is set in.
    facing = nodes.new('ShaderNodeNewGeometry')
    front = nodes.new('ShaderNodeMath')
    front.operation = 'MULTIPLY_ADD'
    front.inputs[1].default_value = -strength
    front.inputs[2].default_value = strength
    m.node_tree.links.new(facing.outputs['Backfacing'], front.inputs[0])
    m.node_tree.links.new(front.outputs['Value'], emit.inputs['Strength'])
    m.node_tree.links.new(emit.outputs['Emission'], nodes.get('Material Output').inputs['Surface'])
    return m


def bake(objects, passes, samples):
    bpy.context.scene.cycles.samples = samples
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.bake(type='DIFFUSE', pass_filter=passes, margin=6, margin_type='EXTEND', use_clear=True, target='IMAGE_TEXTURES')


def denoise(light, normals, work):
    """Intel's denoiser, through the compositor: a bake has no denoising of its own. The normals keep the edges between
    surfaces sharp."""
    scene = bpy.context.scene
    size = light.shape[0]
    images = []
    for name, data in (('noisy', light), ('normals', normals)):
        img = bpy.data.images.new(name, size, size, float_buffer=True, alpha=False)
        img.colorspace_settings.name = 'Non-Color'
        img.pixels.foreach_set(np.concatenate([data, np.ones((size, size, 1), dtype=np.float32)], axis=2).astype(np.float32).reshape(-1))
        images.append(img)
    tree = bpy.data.node_groups.new('denoise', 'CompositorNodeTree')
    scene.compositing_node_group = tree
    nodes = tree.nodes
    src, nor = nodes.new('CompositorNodeImage'), nodes.new('CompositorNodeImage')
    src.image, nor.image = images
    dn = nodes.new('CompositorNodeDenoise')
    dn.inputs['HDR'].default_value = True
    out = nodes.new('NodeGroupOutput')
    tree.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    tree.links.new(src.outputs['Image'], dn.inputs['Image'])
    tree.links.new(nor.outputs['Image'], dn.inputs['Normal'])
    tree.links.new(dn.outputs['Image'], out.inputs[0])
    engine = scene.render.engine
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    if scene.camera is None:
        cam = bpy.data.objects.new('camera', bpy.data.cameras.new('camera'))
        scene.collection.objects.link(cam)
        scene.camera = cam
    scene.render.image_settings.file_format = 'OPEN_EXR'
    scene.render.filepath = os.path.join(work, 'denoised.exr')
    bpy.ops.render.render(write_still=True)
    scene.render.engine = engine
    done = bpy.data.images.load(scene.render.filepath)
    pixels = np.empty(size * size * 4, dtype=np.float32)
    done.pixels.foreach_get(pixels)
    for img in images + [done]:
        bpy.data.images.remove(img)
    bpy.data.node_groups.remove(tree)
    return pixels.reshape(size, size, 4)[:, :, :3]


def main():
    a = args()
    source, out = a[0], a[1]
    wanted = a[2].split(',') if len(a) > 2 and a[2] != 'all' else PARTS
    scale_size = float(a[3]) if len(a) > 3 else 1.0
    samples = int(a[4]) if len(a) > 4 else 256
    data = json.load(open(source, encoding='utf-8'))
    scene = reset()
    scene.render.engine = 'CYCLES'
    gpu(scene)
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 4
    scene.cycles.glossy_bounces = 0
    scene.cycles.transmission_bounces = 0
    scene.cycles.use_denoising = False
    world = bpy.data.worlds.new('world')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0, 0, 0, 1)
    scene.world = world

    targets = {p: [] for p in PARTS}
    realtime = []
    emitters = []
    for item in data['meshes']:
        pos = floats(item['position'], 3).astype(np.float64)
        nor = floats(item['normal'], 3).astype(np.float64)
        if item['role'] == 'panel':
            # The panels split in two: those that stay real-time in the game, and the others.
            room = ROOMS.get(item['part'])
            centres = pos.reshape(-1, 3, 3).mean(axis=1)
            near = np.zeros(len(centres), dtype=bool)
            if room:
                for x, z in REALTIME:
                    near |= (np.abs(centres[:, 0] - x) < 0.4) & (np.abs(centres[:, 2] - (room[1] + z)) < 0.4)
            for flag, suffix in ((near, 'rt'), (~near, 'baked')):
                if flag.any():
                    sel = np.repeat(flag, 3)
                    o = build(f"{item['name']}~{suffix}", pos[sel], nor[sel], item['matrix'])
                    o.data.materials.append(glow(o.name, WARM, PANEL))
                    (realtime if suffix == 'rt' else emitters).append(o)
            continue
        if item['role'] == 'target':
            targets[item['part']].append((item, *place(pos, nor, item['matrix'])))
            continue
        o = build(item['name'], pos, nor, item['matrix'])
        if item['role'] == 'window':
            o.data.materials.append(glow(o.name, item['albedo'], WINDOW))
            emitters.append(o)
        else:
            o.data.materials.append(surface(o.name, item['albedo']))
    for i, light in enumerate(data['lights']):
        ld = bpy.data.lights.new(f'glow{i}', 'POINT')
        ld.color = light['color'][:3]
        ld.energy = 4 * math.pi * light['intensity']
        ld.shadow_soft_size = 0.05
        lo = bpy.data.objects.new(f'glow{i}', ld)
        lo.location = light['position']
        scene.collection.objects.link(lo)
        emitters.append(lo)

    # Each part's surfaces as one object (one material per mesh of the game), so that Cycles bakes it in one pass.
    combined = {}
    for part, items in targets.items():
        if not items:
            continue
        o = build(part, np.concatenate([w for _, w, _ in items]), np.concatenate([n for _, _, n in items]))
        index = np.concatenate([np.full(len(w) // 3, i, dtype=np.int32) for i, (_, w, _) in enumerate(items)])
        for item, _, _ in items:
            o.data.materials.append(surface(item['name'], item['albedo']))
        o.data.polygons.foreach_set('material_index', index)
        combined[part] = (o, items)

    summary = {}
    for part in wanted:
        if part not in combined:
            continue
        target, items = combined[part]
        objs = [target]
        started = time.time()
        size = int(SIZES[part] * scale_size)
        image = bpy.data.images.new(f'lm-{part}', size, size, float_buffer=True, alpha=False)
        image.colorspace_settings.name = 'Non-Color'
        target.data.uv_layers.new(name='light')
        for mat in target.data.materials:
            tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
            tex.image = image
            mat.node_tree.nodes.active = tex
        # One texture for the whole part: its surfaces unwrapped together, flat areas kept whole.
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
        bpy.ops.object.mode_set(mode='OBJECT')
        detail = np.repeat(np.array(target['detail'], dtype=np.float32), 3)
        uv = np.empty(len(target.data.loops) * 2, dtype=np.float32)
        target.data.uv_layers['light'].data.foreach_get('uv', uv)
        target.data.uv_layers['light'].data.foreach_set('uv', (uv.reshape(-1, 2) * detail[:, None]).reshape(-1))
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.select_all(action='SELECT')
        bpy.ops.uv.pack_islands(rotate=True, margin_method='FRACTION', margin=3.0 / size)
        bpy.ops.object.mode_set(mode='OBJECT')

        for o in realtime:
            o.hide_render = False
        bake(objs, {'DIRECT', 'INDIRECT'}, samples)
        full = np.empty(size * size * 4, dtype=np.float32)
        image.pixels.foreach_get(full)
        full = full.reshape(size, size, 4)[:, :, :3].copy()
        # Then only the direct light of the two real-time panels of this room, to be taken away.
        mine = [o for o in realtime if part in ROOMS and o.name.startswith(part + '#')]
        if mine:
            hidden = [o for o in emitters + realtime if o not in mine]
            for o in hidden:
                o.hide_render = True
            bake(objs, {'DIRECT'}, max(64, samples // 4))
            for o in hidden:
                o.hide_render = False
            direct = np.empty(size * size * 4, dtype=np.float32)
            image.pixels.foreach_get(direct)
            full -= direct.reshape(size, size, 4)[:, :, :3]
        # The normals of each texel, for the denoiser.
        bpy.ops.object.select_all(action='DESELECT')
        target.select_set(True)
        bpy.ops.object.bake(type='NORMAL', normal_space='OBJECT', margin=6, margin_type='EXTEND', use_clear=True, target='IMAGE_TEXTURES')
        normals = np.empty(size * size * 4, dtype=np.float32)
        image.pixels.foreach_get(normals)
        normals = normals.reshape(size, size, 4)[:, :, :3] * 2 - 1
        light = np.maximum(denoise(np.maximum(full, 0), normals, out), 0)
        lum = light @ np.array([0.2126, 0.7152, 0.0722])
        scale = float(max(np.percentile(lum, 99.8), 1e-4))
        v = np.clip(light / scale, 0, 1)
        encoded = np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - 0.055)
        (np.round(encoded * 255).astype(np.uint8)).tofile(os.path.join(out, f'{part}.raw'))

        meshes = []
        offset = 0
        uv = np.empty(len(target.data.loops) * 2, dtype=np.float32)
        target.data.uv_layers['light'].data.foreach_get('uv', uv)
        coords = np.round(np.clip(uv, 0, 1) * 65535).astype('<u2')
        for item, w, _ in items:
            meshes.append({'name': item['name'], 'signature': item['signature'], 'offset': offset, 'count': len(w)})
            offset += len(w)
        coords.tofile(os.path.join(out, f'{part}.bin'))
        summary[part] = {'size': size, 'scale': scale, 'meshes': meshes}
        print(f'{part}: {size}px, {len(items)} meshes, scale {scale:.4f}, {time.time() - started:.0f} s', flush=True)
        for mat in target.data.materials:
            mat.node_tree.nodes.remove(mat.node_tree.nodes.active)

    path = os.path.join(out, 'bake.json')
    previous = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {}
    previous.update(summary)
    json.dump(previous, open(path, 'w', encoding='utf-8'), indent=1)


main()
