"""The operator's box on the wall of a site (an NTU, or CSU/DSU), where a leased line comes into the building and the
router's serial cable plugs in: a white powder-coated case on a wall plate, the operator's sticker, three lights (power,
line, data) and a DB-60 serial socket under them, the line itself going out of the back, into the trunking beside it.

    blender --background --factory-startup --python art/blender/ntu.py -- <out.glb> [preview.png]

Markers: `port:LS1` (the serial socket), `led:LS1` (the line light), `tag` (where the game writes the line's name).
"""
import os
import sys

sys.path.append(os.path.dirname(__file__))
import common as c  # noqa: E402

mm = 0.001
W, D, H = 0.24, 0.055, 0.17
FRONT = -D / 2

c.reset()
M = {
    'case': c.material('case', '#eef0f2', 0.45, 0.1),
    'plate': c.material('plate', '#9aa3ad', 0.4, 0.7),
    'dark': c.material('dark', '#14171c', 0.6),
    'socket': c.material('socket', '#2a2f36', 0.35, 0.6),
    'hole': c.material('hole', '#050607', 0.9),
    'sticker': c.material('sticker', '#1d4ed8', 0.6),
    'print': c.material('print', '#f8fafc', 0.5),
    'green': c.material('green', '#22c55e', 0.3, emission='#22c55e', strength=4),
    'amber': c.material('amber', '#f59e0b', 0.3, emission='#f59e0b', strength=3),
    'cable': c.material('cable', '#1f2937', 0.5),
}
parts = []
parts.append(c.box('plate', (W + 0.04, 0.006, H + 0.04), (0, D / 2 + 0.003, H / 2), M['plate'], bevel=2 * mm))
parts.append(c.box('case', (W, D, H), (0, 0, H / 2), M['case'], bevel=6 * mm, segments=3))
# The operator's sticker across the top of the front.
parts.append(c.box('sticker', (W - 0.04, 0.6 * mm, 0.04), (0, FRONT - 0.3 * mm, H - 0.035), M['sticker']))
parts.append(c.text('brand', 'LIGNE LOUÉE · OPÉRATEUR', 0.011, (0, FRONT - 0.7 * mm, H - 0.03), M['print']))
parts.append(c.text('ref', 'NTU  V.35', 0.008, (0, FRONT - 0.7 * mm, H - 0.045), M['print']))
# Three lights and their names.
for i, (name, mat) in enumerate((('PWR', M['green']), ('LINE', M['green']), ('DATA', M['amber']))):
    x = -0.06 + i * 0.05
    parts.append(c.box(f'led-{name}', (4 * mm, 1.5 * mm, 4 * mm), (x, FRONT - 0.7 * mm, 0.095), mat, bevel=1 * mm))
    parts.append(c.text(f'l-{name}', name, 0.0065, (x, FRONT - 0.4 * mm, 0.083), M['dark']))
# The DB-60 serial socket: a trapezoid shell in a dark surround, its pins inside.
SX, SZ = 0.0, 0.045
parts.append(c.box('surround', (0.05, 1.2 * mm, 0.022), (SX, FRONT - 0.5 * mm, SZ), M['dark'], bevel=1 * mm))
shell = c.box('shell', (0.036, 6 * mm, 0.011), (SX, FRONT - 2.5 * mm, SZ), M['socket'], bevel=1.5 * mm)
c.cut(shell, [c.box('mouth', (0.032, 8 * mm, 0.0075), (SX, FRONT - 3 * mm, SZ), M['hole'])])
parts.append(shell)
for row in range(2):
    for k in range(10):
        parts.append(c.box(f'pin{row}{k}', (1 * mm, 2 * mm, 1 * mm), (SX - 0.0135 + k * 0.003, FRONT - 1 * mm, SZ - 0.0015 + row * 0.003), M['hole']))
for s in (-1, 1):
    parts.append(c.box(f'screw{s}', (4 * mm, 3 * mm, 4 * mm), (SX + s * 0.022, FRONT - 1.5 * mm, SZ), M['socket'], bevel=1 * mm))
parts.append(c.text('ls1', 'LS1 · ROUTEUR', 0.0065, (SX, FRONT - 0.4 * mm, SZ - 0.018), M['dark']))
# The operator's line leaves through the back of the case, into the wall trunking beside it (drawn by the game).

body = c.join(parts, 'NTU')
c.attach(c.marker('port:LS1', (SX, FRONT - 3 * mm, SZ)), body)
c.attach(c.marker('led:LS1', (-0.01, FRONT - 1 * mm, 0.095)), body)
c.attach(c.marker('tag', (0, FRONT - 0.7 * mm, H - 0.06)), body)
out = c.args()
c.export_glb(out[0])
print('exported', out[0], 'faces', len(body.data.polygons))
if len(out) > 1:
    c.preview(out[1], target=(0, FRONT, H / 2), distance=0.6, angle=(-20, 8))
