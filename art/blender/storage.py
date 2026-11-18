"""Stockroom pieces shared by the shelving and the bench: lidded storage crates with their label holder, cardboard boxes
of spare gear, cable reels. Imported by `shelving.py` and `bench_crates.py`, never run on its own.

Each function adds its parts to `parts` and returns nothing: the caller joins everything into one mesh. Positions are
the centre of the piece's base; fronts face -Y (+Z in the game), as everywhere else.
"""
import math

import bpy

import common as c

mm = 0.001
M = {}


def materials():
    """The shared materials, made once per scene (after `c.reset()`)."""
    M.update({
        'crate': c.material('crate', '#334155', 0.62, 0.0),
        'crate-dark': c.material('crate-dark', '#1e2633', 0.7, 0.0),
        'lid': c.material('lid', '#22418f', 0.5, 0.0),
        'grip': c.material('grip', '#07090c', 0.9),
        'holder': c.material('holder', '#cbd5e1', 0.45),
        'card': c.material('card', '#f8fafc', 0.8),
        'ink': c.material('ink', '#0b1e3f', 0.6),
        'kraft': c.material('kraft', '#b08657', 0.88),
        'kraft-edge': c.material('kraft-edge', '#9a7246', 0.9),
        'tape': c.material('tape', '#c9a46a', 0.35),
        'flange': c.material('flange', '#16191e', 0.55),
        'hub': c.material('hub', '#050608', 0.8),
    })
    return M


def cylinder(name, radius, depth, at, mat, vertices=32, rotate=(0, math.pi / 2, 0)):
    """A cylinder lying along x by default."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=at, rotation=rotate)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def crate(parts, at, label, w=0.5, d=0.36, h=0.26):
    """A stacking crate with its two-flap lid closed, corner ribs, side grips and a card in a holder on the front."""
    x, y, z = at
    n = f'crate-{label}'
    front = y - d / 2
    parts.append(c.box(f'{n}-foot', (w - 0.03, d - 0.03, 0.014), (x, y, z + 0.007), M['crate-dark'], bevel=3 * mm))
    parts.append(c.box(f'{n}-body', (w - 0.012, d - 0.012, h - 0.04), (x, y, z + 0.012 + (h - 0.04) / 2 - 0.006), M['crate'], bevel=7 * mm, segments=3))
    # The stacking rim under the lid, a little wider than the body.
    parts.append(c.box(f'{n}-rim', (w, d, 0.02), (x, y, z + h - 0.034), M['crate'], bevel=3 * mm))
    # The lid: two flaps meeting along the middle, a raised edge on each.
    for s in (-1, 1):
        parts.append(c.box(f'{n}-flap{s}', (w / 2 - 2 * mm, d - 4 * mm, 0.013), (x + s * (w / 4 + 0.5 * mm), y, z + h - 0.0175), M['lid'], bevel=3 * mm))
        parts.append(c.box(f'{n}-ridge{s}', (6 * mm, d - 0.03, 4 * mm), (x + s * 0.012, y, z + h - 0.009), M['lid'], bevel=1.5 * mm))
    # Ribs down the front corners and along the bottom of the front.
    for s in (-1, 1):
        for face, yy in (('f', front + 4 * mm), ('b', y + d / 2 - 4 * mm)):
            parts.append(c.box(f'{n}-rib{face}{s}', (0.014, 0.008, h - 0.07), (x + s * (w / 2 - 0.03), yy, z + (h - 0.03) / 2), M['crate'], bevel=2 * mm))
    parts.append(c.box(f'{n}-band', (w - 0.08, 0.008, 0.012), (x, front + 4 * mm, z + 0.035), M['crate'], bevel=2 * mm))
    # The grips: a dark slot under the rim on each end.
    for s in (-1, 1):
        parts.append(c.box(f'{n}-grip{s}', (0.008, 0.12, 0.028), (x + s * (w / 2 - 0.009), y, z + h - 0.07), M['grip'], bevel=4 * mm, segments=3))
    # The label holder and its card, the stock written on it.
    hz = z + h * 0.52
    parts.append(c.box(f'{n}-holder', (0.21, 0.006, 0.085), (x, front + 3 * mm, hz), M['holder'], bevel=2 * mm))
    parts.append(c.box(f'{n}-card', (0.19, 0.002, 0.066), (x, front - 0.5 * mm, hz), M['card']))
    size = min(0.03, 0.17 / (0.62 * max(len(label), 1)))
    parts.append(c.text(f'{n}-text', label, size, (x, front - 1.8 * mm, hz), M['ink'], resolution=3))


def carton(parts, at, lines, w=0.52, d=0.34, h=0.1, turn=0.0, tape_on_top=True):
    """A cardboard box of spare gear: flaps meeting on top under a strip of tape, a white label on the front."""
    x, y, z = at
    n = f'carton-{x:.2f}-{z:.2f}'
    made = [c.box(f'{n}-body', (w, d, h), (0, 0, h / 2), M['kraft'], bevel=1.5 * mm, segments=1)]
    made.append(c.box(f'{n}-seam', (w - 0.004, 1.5 * mm, 0.6 * mm), (0, 0, h + 0.2 * mm), M['kraft-edge']))
    if tape_on_top:
        made.append(c.box(f'{n}-tape', (w + 0.002, 0.048, 0.6 * mm), (0, 0, h + 0.5 * mm), M['tape']))
        for s in (-1, 1):
            made.append(c.box(f'{n}-tape-end{s}', (0.6 * mm, 0.048, 0.06), (s * (w / 2 + 0.4 * mm), 0, h - 0.03), M['tape']))
    made.append(c.box(f'{n}-label', (0.15, 0.6 * mm, min(0.07, h - 0.025)), (w * 0.22, -d / 2 - 0.3 * mm, h / 2), M['card']))
    for i, line in enumerate(lines):
        made.append(c.text(f'{n}-l{i}', line, 0.011, (w * 0.22, -d / 2 - 0.9 * mm, h / 2 + (len(lines) - 1) * 0.008 - i * 0.016), M['ink'], resolution=3))
    for o in made:
        o.rotation_euler.z += turn
        o.location.rotate(_rot(turn))
        o.location.x += x
        o.location.y += y
        o.location.z += z
    parts.extend(made)


def _rot(turn):
    from mathutils import Euler
    return Euler((0, 0, turn))


def reel(parts, at, colour_mat, width=0.16, radius=0.13):
    """A reel of cable lying on its side, its axis along x: two flanges, the windings, the hub."""
    x, y, z = at
    zc = z + radius
    n = f'reel-{x:.2f}'
    for s in (-1, 1):
        parts.append(cylinder(f'{n}-flange{s}', radius, 0.008, (x + s * (width / 2 - 0.004), y, zc), M['flange'], 48))
        parts.append(cylinder(f'{n}-hub{s}', 0.026, 0.01, (x + s * (width / 2 + 0.001), y, zc), M['hub'], 24))
    wound = radius - 0.028
    parts.append(cylinder(f'{n}-cable', wound, width - 0.016, (x, y, zc), colour_mat, 48))
    # The turns of cable show as faint rings across the windings.
    for k in range(7):
        parts.append(cylinder(f'{n}-turn{k}', wound + 0.6 * mm, 2.4 * mm, (x - (width - 0.03) / 2 + k * (width - 0.03) / 6, y, zc), colour_mat, 48))
