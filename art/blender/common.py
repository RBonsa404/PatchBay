"""Shared helpers for the IST Network Lab Blender scripts. Run by Blender itself, never by Python alone:

    blender --background --factory-startup --python art/blender/<model>.py -- <out.glb> [preview.png]

Units are metres. Blender is Z up; the glTF export turns that into Y up, and Blender's -Y becomes the model's front (+Z
in the game). Every model sits on its base, centred, its front face at y = -depth / 2.
"""
import math
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector


def args():
    """The arguments after `--` on Blender's command line."""
    return sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    return scene


def material(name, colour, rough=0.5, metal=0.0, emission=None, strength=0.0):
    """A plain physically based material: colour as '#rrggbb' (sRGB)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*srgb(colour), 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*srgb(emission), 1)
        bsdf.inputs['Emission Strength'].default_value = strength
    return m


def srgb(hex_colour):
    """'#rrggbb' in sRGB to linear RGB, as Blender's colour inputs expect."""
    h = hex_colour.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


def box(name, size, at, mat, bevel=0.0, segments=2, parent=None):
    """A box of `size` (x, y, z) whose centre is at `at`, with rounded edges when `bevel` > 0."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Diagonal((*size, 1)))
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = at
    obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    if bevel > 0:
        mod = obj.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = 'ANGLE'
        mod.harden_normals = True
    if parent:
        obj.parent = parent
    return obj


def cut(target, cutters):
    """Carve every cutter out of `target` (exact boolean), then drop the cutters."""
    for c in cutters:
        mod = target.modifiers.new(f'cut-{c.name}', 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.solver = 'EXACT'
        mod.object = c
        c.hide_render = True
        c.hide_set(True)
    apply_modifiers(target)
    for c in cutters:
        bpy.data.objects.remove(c, do_unlink=True)


def apply_modifiers(obj):
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def text(name, body, size, at, mat, align='CENTER', rotate_x=math.pi / 2, extrude=0.0):
    """Flat lettering, turned into a mesh so that the game needs no font."""
    curve = bpy.data.curves.new(name, 'FONT')
    curve.body = body
    curve.size = size
    curve.align_x = align
    curve.align_y = 'CENTER'
    curve.extrude = extrude
    obj = bpy.data.objects.new(name, curve)
    obj.location = at
    obj.rotation_euler = (rotate_x, 0, 0)
    obj.data.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    return bpy.context.view_layer.objects.active


def marker(name, at, parent=None):
    """An empty the game reads by name: where a plug goes, where an LED shines."""
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.006
    e.location = at
    bpy.context.collection.objects.link(e)
    if parent:
        e.parent = parent
    return e


def attach(child, parent):
    """Parent `child` to `parent` without moving it: its world position stays where it was placed."""
    parent_matrix = parent.matrix_world.copy()
    child.parent = parent
    child.matrix_parent_inverse = parent_matrix.inverted()


def join(objects, name):
    """Merge meshes that share a fate into one object (fewer draw calls in the game)."""
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objects:
        apply_modifiers(o)
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    return obj


def export_glb(path):
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_yup=True, export_extras=False, export_cameras=False, export_lights=False)


def preview(path, target=(0, 0, 0.02), distance=0.75, size=(1600, 900), angle=(-35, 18)):
    """A studio render of the model, to check it by eye: soft key light, white floor, Cycles on the graphics card."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for kind in ('OPTIX', 'CUDA'):
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
            for d in prefs.devices:
                d.use = d.type == kind
            scene.cycles.device = 'GPU'
            break
        except Exception:
            continue
    scene.cycles.samples = 96
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.filepath = path
    world = bpy.data.worlds.new('studio')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.58, 0.62, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.35
    scene.world = world
    floor = box('floor', (6, 6, 0.01), (0, 0, -0.005), material('floor', '#d9dde3', 0.6))
    floor.hide_select = True
    for at, energy in (((1.2, -1.4, 1.6), 70), ((-1.6, -0.6, 0.9), 25), ((0.4, 1.5, 1.2), 20)):
        light = bpy.data.lights.new('key', 'AREA')
        light.energy = energy
        light.size = 1.2
        lo = bpy.data.objects.new('key', light)
        lo.location = at
        direction = Vector(target) - Vector(at)
        lo.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
        scene.collection.objects.link(lo)
    cam = bpy.data.cameras.new('cam')
    cam.lens = 70
    co = bpy.data.objects.new('cam', cam)
    yaw, pitch = map(math.radians, angle)
    co.location = Vector(target) + Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch))) * distance
    co.rotation_euler = (Vector(target) - co.location).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(co)
    scene.camera = co
    bpy.ops.render.render(write_still=True)
