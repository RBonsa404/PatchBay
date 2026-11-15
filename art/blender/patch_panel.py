"""A 1U, 24-port Cat6 patch panel as found in every enterprise rack: black powder-coated steel, keystone jacks in four
groups of six, a white write-on label window above each group, port numbers under the jacks, a cable support bar at
the back.

    blender --background --factory-startup --python art/blender/patch_panel.py -- <out.glb> [preview.png]
"""
import os
import sys

sys.path.append(os.path.dirname(__file__))
import common as c  # noqa: E402

W, D, H = 0.445, 0.08, 0.0444
FRONT = -D / 2
mm = 0.001

c.reset()
M = {
    'steel': c.material('steel', '#1a1d21', 0.62, 0.55),
    'jack': c.material('jack', '#2b3036', 0.5, 0.1),
    'hole': c.material('hole', '#060708', 0.85),
    'gold': c.material('gold', '#c9a646', 0.25, 1.0),
    'label': c.material('label', '#eef1f4', 0.7),
    'print': c.material('print', '#e5e9ee', 0.5),
    'bar': c.material('bar', '#3a4048', 0.4, 0.8),
}
face = FRONT
plate = c.box('plate', (W, 1.6 * mm, H), (0, FRONT + 0.8 * mm, H / 2), M['steel'], bevel=0.5 * mm)
parts, labels, markers, cuts = [plate], [], [], []

def x_mm(v):
    return v * mm - W / 2

PITCH = 15.6
GROUPS = [60, 160, 260, 360]  # left edge of each group of six, in mm from the panel's left edge
JACK_Z = 21 * mm
for n in range(1, 25):
    group, k = divmod(n - 1, 6)
    x = x_mm(GROUPS[group] + 7.8 + k * PITCH)
    # The keystone: a square module in a square cut, with its own RJ45 opening.
    cuts.append(c.box(f'cut-{n}', (14.6 * mm, 10 * mm, 16.2 * mm), (x, face, JACK_Z), M['hole']))
    jack = c.box(f'jack-{n}', (14.4 * mm, 6 * mm, 16 * mm), (x, face + 2.2 * mm, JACK_Z), M['jack'], bevel=0.5 * mm)
    c.cut(jack, [c.box(f'jo-{n}', (11.7 * mm, 12 * mm, 10.0 * mm), (x, face, JACK_Z + 1.2 * mm), M['hole']),
                 c.box(f'jn-{n}', (6.0 * mm, 12 * mm, 2.2 * mm), (x, face, JACK_Z + 1.2 * mm - 5.9 * mm), M['hole'])])
    parts.append(jack)
    parts.append(c.box(f'well-{n}', (11.7 * mm, 8 * mm, 12.4 * mm), (x, face + 9 * mm, JACK_Z + 0.6 * mm), M['hole']))
    for i in range(8):
        parts.append(c.box(f'pin-{n}-{i}', (0.55 * mm, 5 * mm, 0.5 * mm), (x - 3.6 * mm + i * 1.03 * mm, face + 7 * mm, JACK_Z + 1.2 * mm + 3.8 * mm), M['gold']))
    labels.append(c.text(f'num-{n}', str(n), 2.4 * mm, (x, face - 0.2 * mm, 7.2 * mm), M['print']))
    markers.append((f'port:P{n}', (x, face - 4 * mm, JACK_Z + 1.2 * mm)))
    markers.append((f'note:P{n}', (x, face - 0.4 * mm, 37.4 * mm)))
for g in GROUPS:
    parts.append(c.box(f'window-{g}', (6 * PITCH * mm - 2 * mm, 0.6 * mm, 6.4 * mm), (x_mm(g + 3 * PITCH), face - 0.3 * mm, 37.4 * mm), M['label'], bevel=0.3 * mm))
c.cut(plate, cuts)

# The cable support bar behind the panel, and the panel's return flanges.
parts.append(c.box('bar', (W - 20 * mm, 4 * mm, 3 * mm), (0, FRONT + 70 * mm, 8 * mm), M['bar'], bevel=1 * mm))
for s in (-1, 1):
    parts.append(c.box(f'flange-{s}', (1.5 * mm, D - 4 * mm, H - 4 * mm), (s * (W / 2 - 1 * mm), 2 * mm, H / 2), M['steel']))
parts.append(c.box('top', (W - 4 * mm, D - 4 * mm, 1.2 * mm), (0, 2 * mm, H - 0.6 * mm), M['steel']))

body = c.join(parts + labels, 'PatchPanel-24')
for name, at in markers:
    c.attach(c.marker(name, at), body)
c.attach(c.marker('tag', (x_mm(30), face - 0.2 * mm, H / 2)), body)

out = c.args()
c.export_glb(out[0])
print('exported', out[0], 'faces', len(body.data.polygons))
if len(out) > 1:
    c.preview(out[1], target=(0.0, FRONT, H / 2), distance=0.7, angle=(-18, 10))
