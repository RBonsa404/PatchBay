"""A person of the game built with MakeHuman (MPFB, CC0 assets): a real body of their age and build, a Burkinabè
face of their own, skin, eyes, hair and clothes made by artists, the game-engine skeleton.

    blender --background --python art/blender/mh_person.py -- <spec.json> <out.glb> [preview.png] [face.png]

`spec.json`: {"sex": "male"|"female", "age": 0.39, "muscle": 0.5, "weight": 0.5, "height": 0.5, "proportions": 0.6,
 "skin": "young_african_male", "hair": "elvs_micky_afro", "eyebrows": "eyebrow001", "eyes": "brown",
 "clothes": [["namuhekam_male_polo_shirt", "#f4f6f8"], ["punkduck_male_classic_jeans", null], …],
 "targets": {"nose/nose-scale-horiz-incr": 0.4, …}}  — a colour tints that garment (null keeps its own).
"""
import json
import os
import sys

import bpy

sys.path.append(os.path.dirname(__file__))
import common as c  # noqa: E402
from bl_ext.user_default.mpfb.services.humanservice import HumanService  # noqa: E402
from bl_ext.user_default.mpfb.services.locationservice import LocationService  # noqa: E402
from bl_ext.user_default.mpfb.services.targetservice import TargetService  # noqa: E402

args = c.args()
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
# Either one person's file, or the cast's file and a name: art/blender/mh_cast.json#awa
_file, _, _who = args[0].partition('#')
spec = json.load(open(_file, encoding='utf-8'))
if _who:
    spec = {**spec.get('_defaults', {}), **spec[_who]}
out = args[1]
data = LocationService.get_user_data()


def asset(kind, name, ext):
    folder = os.path.join(data, kind, name)
    files = [f for f in os.listdir(folder) if f.endswith(ext)]
    return os.path.join(folder, files[0])


c.reset()
macro = {
    'gender': 1.0 if spec['sex'] == 'male' else 0.0,
    'age': spec.get('age', 0.39), 'muscle': spec.get('muscle', 0.5), 'weight': spec.get('weight', 0.5),
    'proportions': spec.get('proportions', 0.6), 'height': spec.get('height', 0.5), 'cupsize': spec.get('cupsize', 0.5),
    'firmness': spec.get('firmness', 0.5),
    'race': {'african': spec.get('african', 1.0), 'asian': 0.0, 'caucasian': 1.0 - spec.get('african', 1.0)},
}
human = HumanService.create_human(macro_detail_dict=macro)
# The face: each person's own features (MakeHuman's detail targets).
for target, value in spec.get('targets', {}).items():
    try:
        TargetService.load_target(human, os.path.join(LocationService.get_mpfb_data('targets'), target + '.target.gz'), weight=value)
    except Exception as e:  # a target missing from this version: the face simply goes without it
        print('target', target, e)
rig = HumanService.add_builtin_rig(human, 'game_engine')
HumanService.set_character_skin(asset('skins', spec['skin'], '.mhmat'), human, skin_type='MAKESKIN')
HumanService.add_mhclo_asset(asset('eyes', 'low-poly', '.mhclo'), human, asset_type='Eyes', subdiv_levels=0)
HumanService.add_mhclo_asset(asset('eyebrows', spec.get('eyebrows', 'eyebrow001'), '.mhclo'), human, asset_type='Eyebrows', subdiv_levels=0)
HumanService.add_mhclo_asset(asset('eyelashes', 'eyelashes01', '.mhclo'), human, asset_type='Eyelashes', subdiv_levels=0)
# The eyes: their iris picture (the default eye material does not come through a script).
for o in bpy.data.objects:
    if o.type == 'MESH' and o.name.endswith('low-poly'):
        o.data.materials.clear()
        m = c.material('eyes', '#ffffff', 0.15)
        tex = m.node_tree.nodes.new('ShaderNodeTexImage')
        img = bpy.data.images.load(os.path.join(data, 'eyes', 'materials', spec.get('eyes', 'brown') + '_eye.png'))
        # The pack's brown iris reads red under the game's light: make it the deep brown of West African eyes,
        # keeping the white of the eye and the iris's own pattern.
        import numpy as np
        w, h = img.size
        px = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        px = px.reshape(-1, 4)
        r, g, b = px[:, 0], px[:, 1], px[:, 2]
        iris = (r > g * 1.25) & (r > b * 1.25)
        lum = (r + g + b) / 3
        tone = np.array(spec.get('iris', [0.19, 0.11, 0.06]), dtype=np.float32)
        px[iris, :3] = np.clip(tone[None, :] * (lum[iris] / max(float(lum[iris].mean()), 1e-3))[:, None], 0, 1)
        img.pixels.foreach_set(px.ravel())
        img.pack()
        tex.image = img
        m.node_tree.links.new(tex.outputs['Color'], m.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
        o.data.materials.append(m)


def tint(objects, colour):
    """Multiply a model's own colour picture by `colour`: its folds, seams and strands stay, its colour changes."""
    for o in objects:
        if o.type != 'MESH':
            continue
        for m in o.data.materials:
            if not m or not m.use_nodes:
                continue
            for n in list(m.node_tree.nodes):
                if n.type != 'BSDF_PRINCIPLED':
                    continue
                src = n.inputs['Base Color'].links[0].from_socket if n.inputs['Base Color'].links else None
                mix = m.node_tree.nodes.new('ShaderNodeMix')
                mix.data_type = 'RGBA'
                mix.blend_type = 'MULTIPLY'
                mix.inputs['Factor'].default_value = 1.0
                if src:
                    m.node_tree.links.new(src, mix.inputs['A'])
                else:
                    mix.inputs['A'].default_value = n.inputs['Base Color'].default_value
                mix.inputs['B'].default_value = (*c.srgb(colour), 1)
                m.node_tree.links.new(mix.outputs['Result'], n.inputs['Base Color'])


def base_image(m):
    """The picture that gives a material its colour, and the node holding it."""
    bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf or not bsdf.inputs['Base Color'].links:
        return None, None, bsdf
    node = bsdf.inputs['Base Color'].links[0].from_node
    while node.type != 'TEX_IMAGE':
        ins = [i for i in node.inputs if i.links]
        if not ins:
            return None, None, bsdf
        node = ins[0].links[0].from_node
    return node, node.image, bsdf


def uv_mask(o, faces, w, h):
    """The texels a set of faces covers in the garment's picture."""
    import numpy as np
    uv = o.data.uv_layers.active.data
    mask = np.zeros((h, w), dtype=bool)
    for poly in faces:
        pts = [uv[i].uv for i in poly.loop_indices]
        for k in range(1, len(pts) - 1):
            tri = np.array([[pts[0].x * w, pts[0].y * h], [pts[k].x * w, pts[k].y * h], [pts[k + 1].x * w, pts[k + 1].y * h]])
            x0, y0 = np.floor(tri.min(axis=0)).astype(int)
            x1, y1 = np.ceil(tri.max(axis=0)).astype(int)
            x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, w - 1), min(y1, h - 1)
            if x1 < x0 or y1 < y0:
                continue
            gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            (ax, ay), (bx, by), (qx, qy) = tri
            d = (by - qy) * (ax - qx) + (qx - bx) * (ay - qy)
            if abs(d) < 1e-9:
                continue
            l1 = ((by - qy) * (gx - qx) + (qx - bx) * (gy - qy)) / d
            l2 = ((qy - ay) * (gx - qx) + (ax - qx) * (gy - qy)) / d
            mask[y0:y1 + 1, x0:x1 + 1] |= (l1 >= -0.01) & (l2 >= -0.01) & (1 - l1 - l2 >= -0.01)
    return mask


def dress(objects, colour, prints, front_sign, flat=False):
    """Colour a garment in the club's colours and print on it: the colour multiplied into its own picture (folds and
    seams stay), then the club's logo on the chest and the big print on the back, laid through the garment's own
    texture coordinates so they follow the cloth."""
    import numpy as np
    for o in objects:
        if o.type != 'MESH':
            continue
        for m in o.data.materials:
            if not m or not m.use_nodes:
                continue
            node, img, bsdf = base_image(m)
            if img is None:
                if colour and bsdf:
                    bsdf.inputs['Base Color'].default_value = (*c.srgb(colour), 1)
                continue
            w, h = img.size
            px = np.empty(w * h * 4, dtype=np.float32)
            img.pixels.foreach_get(px)
            px = px.reshape(h, w, 4)
            if colour:
                lum = px[:, :, :3].mean(axis=2, keepdims=True)
                ref = float(np.percentile(lum, 80)) or 1.0
                if flat:
                    # A plain cloth: the factory prints go, a faint weave stays; the folds come from the shape and light.
                    rng = np.random.default_rng(7)
                    lum = (0.96 + 0.04 * rng.random(lum.shape)).astype(np.float32)
                    ref = 1.0
                    px[:, :, 3] = 1.0
                    if bsdf:
                        for l in list(bsdf.inputs['Alpha'].links):
                            m.node_tree.links.remove(l)
                        bsdf.inputs['Alpha'].default_value = 1.0
                        m.blend_method = 'OPAQUE' if hasattr(m, 'blend_method') else None
                # A float picture holds linear light, an 8-bit one holds sRGB values.
                tone = np.array(c.srgb(colour), dtype=np.float32)
                if not img.is_float:
                    tone = tone ** (1 / 2.2)
                px[:, :, :3] = np.clip(tone * (lum / ref), 0, 1)
            for kind, path, cz, width in prints:
                art = bpy.data.images.load(path if os.path.isabs(path) else os.path.join(ROOT, path))
                aw, ah = art.size
                apx = np.empty(aw * ah * 4, dtype=np.float32)
                art.pixels.foreach_get(apx)
                apx = apx.reshape(ah, aw, 4)
                height = width * ah / aw
                side = front_sign if kind == 'front' else -front_sign
                uv = o.data.uv_layers.active.data
                mesh = o.data
                mw, mn = o.matrix_world, o.matrix_world.to_3x3()
                # Every texel of the faces under the print, with the true place on the body it paints (each face mapped on
                # its own: garments cut their picture into several pieces, turned every way).
                TX, TY, XS, ZS = [], [], [], []
                for poly in mesh.polygons:
                    cpos = mw @ poly.center
                    if abs(cpos.x) > width * 0.8 or abs(cpos.z - cz) > height * 0.8 or (mn @ poly.normal).y * side < 0.3:
                        continue
                    li = list(poly.loop_indices)
                    P = [mw @ mesh.vertices[mesh.loops[i].vertex_index].co for i in li]
                    T = [(uv[i].uv.x * w, uv[i].uv.y * h) for i in li]
                    for k in range(1, len(li) - 1):
                        (ax, ay), (bx, by), (qx, qy) = T[0], T[k], T[k + 1]
                        x0, x1 = max(int(np.floor(min(ax, bx, qx))), 0), min(int(np.ceil(max(ax, bx, qx))), w - 1)
                        y0, y1 = max(int(np.floor(min(ay, by, qy))), 0), min(int(np.ceil(max(ay, by, qy))), h - 1)
                        if x1 < x0 or y1 < y0:
                            continue
                        d = (by - qy) * (ax - qx) + (qx - bx) * (ay - qy)
                        if abs(d) < 1e-9:
                            continue
                        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
                        l1 = ((by - qy) * (gx - qx) + (qx - bx) * (gy - qy)) / d
                        l2 = ((qy - ay) * (gx - qx) + (ax - qx) * (gy - qy)) / d
                        l3 = 1 - l1 - l2
                        inside = (l1 >= -0.02) & (l2 >= -0.02) & (l3 >= -0.02)
                        if not inside.any():
                            continue
                        TX.append((gx[inside] - 0.5).astype(int)); TY.append((gy[inside] - 0.5).astype(int))
                        XS.append(l1[inside] * P[0].x + l2[inside] * P[k].x + l3[inside] * P[k + 1].x)
                        ZS.append(l1[inside] * P[0].z + l2[inside] * P[k].z + l3[inside] * P[k + 1].z)
                if not TX:
                    continue
                tx, ty, X, Z = np.concatenate(TX), np.concatenate(TY), np.concatenate(XS), np.concatenate(ZS)
                # Never the texels the other side of the garment also uses (some garments lay front and back on the same
                # part of the picture: then the print would show twice).
                other = uv_mask(o, [p for p in mesh.polygons if (mn @ p.normal).y * side < -0.2], w, h)
                keep = ~other[ty, tx]
                tx, ty, X, Z = tx[keep], ty[keep], X[keep], Z[keep]
                # Seen from the front the wearer's left is the viewer's right (+x); seen from behind, the other way.
                fx = (X + width / 2) / width if kind == 'front' else (-X + width / 2) / width
                fz = (Z - (cz - height / 2)) / height
                ok = (fx >= 0) & (fx < 1) & (fz >= 0) & (fz < 1)
                sx = np.clip((fx[ok] * aw).astype(int), 0, aw - 1)
                sy = np.clip((fz[ok] * ah).astype(int), 0, ah - 1)
                src = apx[sy, sx]
                a = src[:, 3:4]
                dst = px[ty[ok], tx[ok]]
                dst[:, :3] = dst[:, :3] * (1 - a) + src[:, :3] * a
                px[ty[ok], tx[ok]] = dst
            out = bpy.data.images.new(img.name + '-club', w, h, alpha=True)
            out.pixels.foreach_set(px.ravel())
            out.pack()
            node.image = out
            # The colour is in the picture now: take away any tint between it and the shader.
            if bsdf.inputs['Base Color'].links and bsdf.inputs['Base Color'].links[0].from_node != node:
                m.node_tree.links.new(node.outputs['Color'], bsdf.inputs['Base Color'])


def world_points(o):
    """Where an object's vertices really are: its shape keys (the face and body targets) mixed in."""
    import numpy as np
    n = len(o.data.vertices)
    co = np.empty(n * 3, dtype=np.float64)
    o.data.vertices.foreach_get('co', co)
    co = co.reshape(n, 3)
    if o.data.shape_keys:
        basis = o.data.shape_keys.reference_key
        b = np.empty(n * 3); basis.data.foreach_get('co', b); b = b.reshape(n, 3)
        co = b.copy()
        for k in o.data.shape_keys.key_blocks:
            if k == basis or k.value == 0 or k.mute:
                continue
            d = np.empty(n * 3); k.data.foreach_get('co', d)
            co += (d.reshape(n, 3) - b) * k.value
    mw = np.array(o.matrix_world)
    return co @ mw[:3, :3].T + mw[:3, 3]


def move_points(o, delta):
    """Move an object's vertices (and every shape key with them)."""
    import numpy as np
    n = len(o.data.vertices)
    inv = np.array(o.matrix_world.inverted())[:3, :3]
    dl = (delta @ inv.T).astype(np.float64)
    blocks = [o.data.vertices] + ([k.data for k in o.data.shape_keys.key_blocks] if o.data.shape_keys else [])
    for blk in blocks:
        co = np.empty(n * 3); blk.foreach_get('co', co)
        blk.foreach_set('co', (co.reshape(n, 3) + dl).ravel())
    o.data.update()


def paint_skin(faces_pick, shade, tone=(0.5, 0.52, 0.54)):
    """Paint on the body's own picture: shade(x, y, z) gives, for each texel of the picked faces, how much of the hair
    colour lies on the skin there (0 to 1)."""
    import numpy as np
    node, img, _ = base_image(human.data.materials[0])
    if img is None:
        return
    w, h = img.size
    if not img.name.endswith('-groom'):
        new = bpy.data.images.new(img.name + '-groom', w, h, alpha=True)
        px = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(px)
        new.pixels.foreach_set(px); new.pack()
        for m in human.data.materials:
            n2, i2, _ = base_image(m)
            if i2 == img:
                n2.image = new
        img = new
    px = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(px); px = px.reshape(h, w, 4)
    P = world_points(human)
    uv = human.data.uv_layers.active.data
    hair = np.array(c.srgb(spec.get('hair_colour', '#1a1a1a')), dtype=np.float32) ** (1 / 2.2) * 0.55
    rng = np.random.default_rng(3)
    acc = np.zeros((h, w), dtype=np.float32)
    for poly in human.data.polygons:
        if not faces_pick(poly):
            continue
        li = list(poly.loop_indices); vi = list(poly.vertices)
        T = [(uv[i].uv.x * w, uv[i].uv.y * h) for i in li]
        for k in range(1, len(li) - 1):
            (ax, ay), (bx, by), (qx, qy) = T[0], T[k], T[k + 1]
            x0, x1 = max(int(np.floor(min(ax, bx, qx))), 0), min(int(np.ceil(max(ax, bx, qx))), w - 1)
            y0, y1 = max(int(np.floor(min(ay, by, qy))), 0), min(int(np.ceil(max(ay, by, qy))), h - 1)
            d = (by - qy) * (ax - qx) + (qx - bx) * (ay - qy)
            if x1 < x0 or y1 < y0 or abs(d) < 1e-9:
                continue
            gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            l1 = ((by - qy) * (gx - qx) + (qx - bx) * (gy - qy)) / d
            l2 = ((qy - ay) * (gx - qx) + (ax - qx) * (gy - qy)) / d
            l3 = 1 - l1 - l2
            ins = (l1 >= -0.03) & (l2 >= -0.03) & (l3 >= -0.03)
            if not ins.any():
                continue
            pa, pb, pq = P[vi[0]], P[vi[k]], P[vi[k + 1]]
            X = l1[ins] * pa[0] + l2[ins] * pb[0] + l3[ins] * pq[0]
            Y = l1[ins] * pa[1] + l2[ins] * pb[1] + l3[ins] * pq[1]
            Z = l1[ins] * pa[2] + l2[ins] * pb[2] + l3[ins] * pq[2]
            a = np.clip(shade(X, Y, Z), 0, 1) * (0.8 + 0.2 * rng.random(X.shape))
            ty, tx = (gy[ins] - 0.5).astype(int), (gx[ins] - 0.5).astype(int)
            acc[ty, tx] = np.maximum(acc[ty, tx], a)
    # Hair seen through dark skin: the skin itself, darker and a touch cooler (black would read grey under the light).
    # One pass over the summed coverage, so the edges shared by two faces are not painted twice.
    a = acc[..., None]
    px[..., :3] = px[..., :3] * (1 - a * np.array(tone, dtype=np.float32))
    img.pixels.foreach_set(px.ravel())
    img.pack()
    if spec.get('debug_skin'):
        img.filepath_raw = spec['debug_skin']; img.file_format = 'PNG'; img.save()
    print('SKIN', img.name, img.is_float, img.colorspace_settings.name, float(px[..., :3].mean()))


def groom(hair_objs):
    """The barber's work. A fade: the hair taken down to the skull on the sides and the nape, the scalp under it
    painted from dense stubble at the top to bare skin at the bottom. A beard: a short, trimmed shadow on the jaw."""
    import numpy as np
    from mathutils.bvhtree import BVHTree
    from mathutils import Vector
    eyes = next((o for o in bpy.data.objects if o.type == 'MESH' and o.name.endswith('low-poly')), None)
    E = world_points(eyes).mean(axis=0) if eyes else np.array([0, -0.08, 1.6])
    P = world_points(human)
    body_group = human.vertex_groups.get('body')
    in_body = np.zeros(len(P), dtype=bool)
    if body_group:
        gi = body_group.index
        for v in human.data.vertices:
            if any(g.group == gi for g in v.groups):
                in_body[v.index] = True
    else:
        in_body[:] = True
    print('GROOM eyes', E, 'body verts', int(in_body.sum()))
    fade = spec.get('fade')
    if fade and hair_objs:
        top, low = E[2] + fade.get('top', 0.06), E[2] + fade.get('low', -0.01)
        polys = [p for p in human.data.polygons if all(in_body[v] for v in p.vertices)]
        tree = BVHTree.FromPolygons([Vector(p) for p in P], [list(p.vertices) for p in polys])
        foot = np.zeros(len(P), dtype=bool)
        for o in hair_objs:
            if o.type != 'MESH':
                continue
            H = world_points(o)
            htree = BVHTree.FromPolygons([Vector(p) for p in H], [list(p.vertices) for p in o.data.polygons])
            for i in np.nonzero(in_body & (P[:, 2] > low - 0.04))[0]:
                hit = htree.find_nearest(Vector(P[i]))
                if hit[0] is not None and hit[3] < 0.03 and P[i][1] > E[1] - 0.005:
                    foot[i] = True
            # The hair itself: lower down it hugs the skull, then goes under the skin where the head is shaved.
            delta = np.zeros_like(H)
            for j, p in enumerate(H):
                if p[2] >= top:
                    continue
                t = min((top - p[2]) / max(top - low, 1e-3), 1.0)
                loc, nrm, _, dist = tree.find_nearest(Vector(p))
                if loc is None:
                    continue
                side = 1 if (Vector(p) - loc).dot(nrm) > 0 else -1
                target = np.array(loc) + np.array(nrm) * (side * dist * (1 - t) - 0.004 * t)
                delta[j] = target - p
            print('GROOM moved', o.name, int((np.abs(delta).sum(axis=1) > 0).sum()), 'of', len(H), 'z range', float(H[:, 2].min()), float(H[:, 2].max()))
            if not spec.get('debug_nomove'):
                move_points(o, delta)
        print('GROOM foot', int(foot.sum()))
        dens = fade.get('density', 0.9)
        def scalp(X, Y, Z):
            fall = np.clip((Z - (low - 0.03)) / max(top - low + 0.03, 1e-3), 0.05, 1) ** 0.8
            # A clean front line: the forehead stays bare up to the hairline, the temples are cut square.
            front = (Y < E[1] + 0.05) & (np.abs(X) < 0.062)
            line = np.where(front, np.clip((Z - (E[2] + fade.get('hairline', 0.075))) / 0.006, 0, 1), 1.0)
            temple = np.where(Y < E[1] + 0.035, np.clip((np.abs(X) - 0.058) / 0.004, 0, 1), 1.0)
            return dens * fall * np.maximum(line, 0) * np.where(front, 1.0, temple)
        paint_skin(lambda poly: any(foot[v] for v in poly.vertices), scalp)
    beard = spec.get('beard')
    if beard:
        # Moustache and goatee, kept short: a shadow around the mouth, nothing on the cheeks or the neck.
        lo, hi = E[2] - 0.14, E[2] - 0.05

        def pick(poly):
            m = P[list(poly.vertices)].mean(axis=0)
            return (all(in_body[v] for v in poly.vertices) and lo < m[2] < hi and m[1] < E[1] + 0.03 and abs(m[0]) < 0.05
                    and human.data.materials[poly.material_index].name.split('.')[-1] not in ('lips',))

        def shade(X, Y, Z):
            width = np.clip((0.034 - np.abs(X)) / 0.008, 0, 1)
            under = np.clip(((E[2] - 0.098) - Z) / 0.006, 0, 1) * np.clip((Z - (E[2] - 0.135)) / 0.01, 0, 1)
            over = np.clip((Z - (E[2] - 0.078)) / 0.004, 0, 1) * np.clip(((E[2] - 0.058) - Z) / 0.006, 0, 1)
            return beard * width * np.maximum(under, over)
        paint_skin(pick, shade)


def finish_skin():
    """Skin that keeps its colour: little scattering (deep skin greys under it), lips a touch deeper than the pack's."""
    import numpy as np
    for m in human.data.materials:
        b = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None) if m and m.use_nodes else None
        if b and 'Subsurface Weight' in b.inputs:
            b.inputs['Subsurface Weight'].default_value = min(b.inputs['Subsurface Weight'].default_value, 0.04)
        if b and 'Specular IOR Level' in b.inputs:
            b.inputs['Specular IOR Level'].default_value = 0.32
    lips = spec.get('lips', 0.3)
    if lips:
        paint_skin(lambda poly: human.data.materials[poly.material_index].name.split('.')[-1] == 'lips', lambda X, Y, Z: lips + 0 * X, tone=(0.42, 0.55, 0.52))


hair_objs = []
if spec.get('hair'):
    before = set(bpy.data.objects)
    HumanService.add_mhclo_asset(asset('hair', spec['hair'], '.mhclo'), human, asset_type='Hair', subdiv_levels=0)
    hair_objs = list(set(bpy.data.objects) - before)
    if spec.get('hair_colour'):
        tint(hair_objs, spec['hair_colour'])
if spec.get('fade') or spec.get('beard'):
    groom(hair_objs)
finish_skin()

# MakeHuman people always face -Y.
front_sign = -1
# A print's height is either where it sits (metres) or, when negative, how far below the eyes: the same for everyone.
_eyes = next((o for o in bpy.data.objects if o.type == 'MESH' and o.name.endswith('low-poly')), None)
EYE_Z = float(world_points(_eyes)[:, 2].mean()) if _eyes else 1.7
for item in spec.get('clothes', []):
    name, colour = item[0], item[1]
    prints = item[2] if len(item) > 2 else []
    before = set(bpy.data.objects)
    HumanService.add_mhclo_asset(asset('clothes', name, '.mhclo'), human, asset_type='Clothes', subdiv_levels=0)
    if prints:
        # A top worn over trousers: a few millimetres of room, so the waistband never shows through it.
        for o in set(bpy.data.objects) - before:
            if o.type != 'MESH':
                continue
            o.data.update()
            keys = o.data.shape_keys.key_blocks if o.data.shape_keys else []
            for v in o.data.vertices:
                waist = spec.get('waist', 1.06 if spec['sex'] == 'male' else 0.98)
                z = (o.matrix_world @ v.co).z
                push = v.normal * (0.0025 + 0.0045 * min(max((waist + 0.08 - z) / 0.12, 0.0), 1.0))
                v.co += push
                for k in keys:
                    k.data[v.index].co += push
    if colour or prints:
        prints = [(k, pth, EYE_Z + z if z < 0 else z, wd) for k, pth, z, wd in prints]
        dress(set(bpy.data.objects) - before, colour, [tuple(p) for p in prints], front_sign, bool(item[3]) if len(item) > 3 else False)
# Under a top, the waistband of the trousers is hidden anyway: take it away, so it can never show through the cloth.
tops = [o for o in bpy.data.objects if o.type == 'MESH' and any(o.name.endswith(i[0]) for i in spec.get('clothes', []) if len(i) > 2 and i[2])]
if tops:
    hem = min((t.matrix_world @ v.co).z for t in tops for v in t.data.vertices)
    for o in bpy.data.objects:
        if o.type != 'MESH' or o in tops or not any(o.name.endswith(i[0]) for i in spec.get('clothes', [])):
            continue
        import bmesh
        bm = bmesh.new()
        bm.from_mesh(o.data)
        gone = [f for f in bm.faces if all((o.matrix_world @ v.co).z > hem + 0.012 for v in f.verts)]
        bmesh.ops.delete(bm, geom=gone, context='FACES')
        bm.to_mesh(o.data)
        bm.free()
print('built', human.name, [o.name for o in bpy.data.objects if o.type == 'MESH'])
if len(args) > 2:
    c.preview(args[2], target=(0, 0, 0.92), distance=3.4, angle=(-22, 5), size=(700, 1000))
if len(args) > 3:
    c.preview(args[3], target=(0, 0, EYE_Z - 0.07), distance=0.75, angle=(-18, 3), size=(800, 800))
if len(args) > 4:
    c.preview(args[4], target=(0, 0, 1.2), distance=2.4, angle=(158, 5), size=(700, 800))


def export_person(path):
    """The person for the game: the hidden helper geometry and the body under the clothes taken away for good, the face
    and body shapes made permanent, pictures at 1024 px in WEBP, the game-engine skeleton. No animation: the game shares
    the clips of anims.glb between everyone."""
    import bmesh
    rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == rig or (o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers))]
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        if o.data.shape_keys:
            o.shape_key_add(name='mix', from_mix=True)
            keys = o.data.shape_keys.key_blocks
            mix = [k.co.copy() for k in keys['mix'].data]
            o.shape_key_clear()
            for v, co in zip(o.data.vertices, mix):
                v.co = co
        # Everything but the skeleton made permanent (the masks that hide the helpers and the skin under the clothes).
        for m in list(o.modifiers):
            if m.type != 'ARMATURE':
                try:
                    bpy.ops.object.modifier_apply(modifier=m.name)
                except Exception as e:  # a modifier that cannot apply simply goes
                    print('modifier', o.name, m.name, e)
                    o.modifiers.remove(m)
        if o.name == human.name:
            hg = o.vertex_groups.get('HelperGeometry')
            if hg:
                bm = bmesh.new()
                bm.from_mesh(o.data)
                deform = bm.verts.layers.deform.verify()
                gone = [v for v in bm.verts if hg.index in v[deform]]
                bmesh.ops.delete(bm, geom=gone, context='VERTS')
                bm.to_mesh(o.data)
                bm.free()
        # The body's materials (skin, lips, nails, ears...) all read the same picture: one material, one draw call.
        if o.name == human.name and len(o.data.materials) > 1:
            for poly in o.data.polygons:
                poly.material_index = 0
            while len(o.data.materials) > 1:
                o.data.materials.pop(index=len(o.data.materials) - 1)
        # Only the groups of the skeleton's bones travel with the mesh.
        bones = {b.name for b in rig.data.bones}
        for g in list(o.vertex_groups):
            if g.name not in bones:
                o.vertex_groups.remove(g)
        o.select_set(False)
    # The skin under the tops goes a little inside them: an arm that bends can no longer push it through a sleeve.
    from mathutils.bvhtree import BVHTree
    tops = [o for o in meshes if any(o.name.endswith(i[0]) for i in spec.get('clothes', []) if len(i) > 2 and i[2]) or 'shirt' in o.name or 'suit' in o.name]
    body = next((o for o in meshes if o.name == human.name), None)
    if body and tops:
        trees = []
        for t in tops:
            mw = t.matrix_world
            trees.append(BVHTree.FromPolygons([mw @ v.co for v in t.data.vertices], [list(p.vertices) for p in t.data.polygons]))
        bw = body.matrix_world
        inv = bw.inverted().to_3x3()
        body.data.update()
        moved = 0
        for v in body.data.vertices:
            p = bw @ v.co
            if any((hit := tr.find_nearest(p))[0] is not None and hit[3] < 0.035 for tr in trees):
                n = (bw.to_3x3() @ v.normal).normalized()
                v.co = bw.inverted() @ (p - n * 0.007)
                moved += 1
        body.data.update()
        print('tucked skin under tops', moved)
    # Lighter for the game: a person seen at a few metres needs far fewer triangles than a close-up render. Hair cards,
    # eyes, brows and lashes keep theirs (thin cut-out shapes do not survive simplifying).
    for o in meshes:
        n = o.name.lower()
        if any(k in n for k in ('eye', 'brow', 'lash', 'low-poly')) or o.name in [h.name for h in hair_objs]:
            continue
        ratio = 0.3 if any(k in n for k in ('shoe', 'sneaker', 'flat', 'maryjane', 'oxford')) else 0.45
        before = len(o.data.polygons)
        if before < 1500:
            continue
        bpy.context.view_layer.objects.active = o
        mod = o.modifiers.new('lighter', 'DECIMATE')
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        # Before the skeleton's modifier: simplified in the rest pose.
        while o.modifiers[0] != mod:
            bpy.ops.object.modifier_move_up(modifier=mod.name)
        bpy.ops.object.modifier_apply(modifier=mod.name)
        print('lighter', o.name, before, '->', len(o.data.polygons))
    for img in bpy.data.images:
        if img.size[0] > 1024 and img.has_data:
            img.scale(1024, max(1, img.size[1] * 1024 // img.size[0]))
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_animations=False,
                              export_image_format='WEBP', export_skins=True, export_yup=True, export_apply=False,
                              export_morph=False)
    print('exported', path, os.path.getsize(path) // 1024, 'KB', sum(len(o.data.polygons) for o in meshes), 'faces')


if out.endswith('.glb'):
    export_person(out)
