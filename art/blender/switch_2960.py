"""Cisco Catalyst 2960-24TT-L, after the figures and dimensions of Cisco's hardware installation guide (OL-7075):
44.45 x 32.76 x 4.39 cm, 1U; 24 10/100 ports in two blocks of six columns, port 1 at top left, a pair of LEDs per column
above the ports; two 10/100/1000 uplinks; SYST, RPS, STAT, DUPLX, SPEED LEDs and the MODE button on the left.

The game keeps the console port on the front, at the left (the 24TT-L has it at the back, out of the player's reach in
a rack against the wall). No maker's logo: the model name only.

Empties named `port:<interface>` sit at each socket's mouth and `led:<interface>` at each link LED; the game reads them.
"""
import math
import os
import sys

sys.path.append(os.path.dirname(__file__))
import common as c  # noqa: E402

W, D, H = 0.4445, 0.3276, 0.0439
FRONT = -D / 2
mm = 0.001

c.reset()
M = {
    'chassis': c.material('chassis', '#2f363f', 0.42, 0.75),
    'bezel': c.material('bezel', '#8fa6b8', 0.38, 0.35),
    'recess': c.material('recess', '#3f5568', 0.45, 0.3),
    'hole': c.material('hole', '#08090b', 0.8),
    'gold': c.material('gold', '#c9a646', 0.25, 1.0),
    'frame': c.material('frame', '#d7dde3', 0.35, 0.6),
    'uplink': c.material('uplink', '#e7b416', 0.4, 0.1),
    'console': c.material('console', '#2fa7e0', 0.4, 0.1),
    'print': c.material('print', '#f1f5f9', 0.5),
    'dark-print': c.material('dark-print', '#1d2833', 0.5),
    'led-off': c.material('led-off', '#26313d', 0.3),
    'led-on': c.material('led-on', '#10b981', 0.3, 0, '#10b981', 6),
    'button': c.material('button', '#3a4552', 0.5, 0.2),
    'rubber': c.material('rubber', '#15181c', 0.9),
}

# The steel case, and the front bezel standing 3 mm proud of it.
case = c.box('case', (W - 2 * mm, D - 4 * mm, H), (0, 2 * mm, H / 2), M['chassis'], bevel=1.2 * mm)
bezel = c.box('bezel', (W, 4 * mm, H), (0, FRONT + 2 * mm, H / 2), M['bezel'], bevel=1.0 * mm)
face = FRONT

def x_mm(v):
    """Millimetres from the left edge of the front panel to the model's x."""
    return v * mm - W / 2

# The ports: a darker recessed panel, then a socket cut through it for each port.
recess = c.box('recess', (192 * mm, 3 * mm, H - 6 * mm), (x_mm(296), face + 1.2 * mm, H / 2), M['recess'], bevel=0.8 * mm)
PITCH, PW, PH = 14.4 * mm, 11.7 * mm, 10.0 * mm
ROWS = {'top': 29.6 * mm, 'bottom': 15.2 * mm}
sockets = {}
for n in range(1, 25):
    column = (n - 1) // 2
    block_x = 207 if column < 6 else 298
    x = x_mm(block_x + 7.2 + (column % 6) * 14.4)
    z = ROWS['top'] if n % 2 else ROWS['bottom']
    sockets[f'FastEthernet0/{n}'] = (x, z)
sockets['GigabitEthernet0/1'] = (x_mm(398.5), 19.0 * mm)
sockets['GigabitEthernet0/2'] = (x_mm(420.5), 19.0 * mm)
CONSOLE = (x_mm(62), 19.0 * mm)
sockets['Console'] = CONSOLE

cutters = []
for name, (x, z) in sockets.items():
    cutters.append(c.box(f'cut-{name}', (PW, 30 * mm, PH), (x, face, z), M['hole']))
    # The latch notch under the opening.
    cutters.append(c.box(f'notch-{name}', (6.0 * mm, 30 * mm, 2.2 * mm), (x, face, z - PH / 2 - 0.9 * mm), M['hole']))
for part in (bezel, recess):
    c.cut(part, [c.box(f'{k.name}-copy-{part.name}', k.dimensions, k.location, M['hole']) for k in cutters])
for k in cutters:
    bpy_obj = k
    import bpy
    bpy.data.objects.remove(bpy_obj, do_unlink=True)

import bpy  # noqa: E402

# Inside each socket: a black well, eight gold contacts along its top, and the ring around the uplinks and the console.
details = []
for name, (x, z) in sockets.items():
    details.append(c.box(f'well-{name}', (PW, 14 * mm, PH + 2.4 * mm), (x, face + 9.5 * mm, z - 0.6 * mm), M['hole']))
    for i in range(8):
        details.append(c.box(f'pin-{name}-{i}', (0.55 * mm, 7 * mm, 0.5 * mm), (x - 3.6 * mm + i * 1.03 * mm, face + 7 * mm, z + PH / 2 - 1.2 * mm), M['gold']))
    if name.startswith('Gigabit'):
        details.append(c.box(f'ring-{name}', (PW + 3 * mm, 0.8 * mm, PH + 5.6 * mm), (x, face - 0.25 * mm, z - 0.8 * mm), M['uplink']))
    elif name == 'Console':
        details.append(c.box(f'ring-{name}', (PW + 3 * mm, 0.8 * mm, PH + 5.6 * mm), (x, face - 0.25 * mm, z - 0.8 * mm), M['console']))
# The rings are frames, not plates: carve the openings back out of them.
rings = [d for d in details if d.name.startswith('ring-')]
for ring in rings:
    x, _, z = ring.location
    c.cut(ring, [c.box(f'ring-hole-{ring.name}', (PW + 0.2 * mm, 3 * mm, PH + 0.2 * mm), (x, face, z + 0.8 * mm), M['hole']),
                 c.box(f'ring-notch-{ring.name}', (6.2 * mm, 3 * mm, 2.4 * mm), (x, face, z + 0.8 * mm - PH / 2 - 0.9 * mm), M['hole'])])

# Port numbers above the ports and the strip of port LEDs, as on the guide's figure 1-17.
labels = []
for n in range(1, 25, 2):
    x = sockets[f'FastEthernet0/{n}'][0]
    labels.append(c.text(f'num-{n}', f'{n}  {n + 1}', 2.2 * mm, (x, face - 0.5 * mm, 38.4 * mm), M['print']))
for i, name in enumerate(('GigabitEthernet0/1', 'GigabitEthernet0/2')):
    x, z = sockets[name]
    labels.append(c.text(f'num-gi{i}', str(i + 1), 2.2 * mm, (x + 4.5 * mm, face - 0.15 * mm, z + 12.8 * mm), M['dark-print']))
labels.append(c.text('console-label', 'CONSOLE', 1.9 * mm, (CONSOLE[0], face - 0.15 * mm, CONSOLE[1] + 10.2 * mm), M['dark-print']))
labels.append(c.text('model', 'Catalyst 2960 Series', 2.0 * mm, (x_mm(428), face - 0.15 * mm, 40.0 * mm), M['dark-print'], align='RIGHT'))
labels.append(c.text('uplinks', '10/100/1000', 1.6 * mm, (x_mm(409.5), face - 0.15 * mm, 6.0 * mm), M['dark-print']))

# System LEDs and their names, the MODE button.
for i, name in enumerate(('SYST', 'RPS', 'STAT', 'DUPLX', 'SPEED')):
    z = 36.5 * mm - i * 5.2 * mm
    details.append(c.box(f'sys-led-{name}', (3.2 * mm, 1.0 * mm, 1.7 * mm), (x_mm(11), face - 0.3 * mm, z), M['led-on'] if name == 'SYST' else M['led-off'], bevel=0.4 * mm))
    labels.append(c.text(f'sys-{name}', name, 1.6 * mm, (x_mm(14.5), face - 0.15 * mm, z), M['dark-print'], align='LEFT'))
details.append(c.box('mode', (6.5 * mm, 2.0 * mm, 3.2 * mm), (x_mm(13), face - 0.6 * mm, 6.5 * mm), M['button'], bevel=0.8 * mm))
labels.append(c.text('mode-label', 'MODE', 1.6 * mm, (x_mm(13), face - 0.15 * mm, 10.2 * mm), M['dark-print']))

# Vents along both sides and the power inlet at the back.
side_cuts = []
for side in (-1, 1):
    for i in range(16):
        side_cuts.append(c.box(f'vent-{side}-{i}', (6 * mm, 3.2 * mm, 18 * mm), (side * W / 2, -0.09 + i * 8 * mm, H / 2), M['hole']))
c.cut(case, side_cuts)
details.append(c.box('inlet', (32 * mm, 6 * mm, 24 * mm), (W / 2 - 60 * mm, D / 2 - 1 * mm, H / 2), M['rubber'], bevel=1.5 * mm))

# Port markers for the game: the mouth of each socket, and one LED per port above its column.
markers = []
for name, (x, z) in sockets.items():
    markers.append(c.marker(f'port:{name}', (x, face - 4 * mm, z)))
for n in range(1, 25):
    x, _ = sockets[f'FastEthernet0/{n}']
    at = (x + (-2.6 if n % 2 else 2.6) * mm, face - 0.4 * mm, 35.2 * mm)
    markers.append(c.marker(f'led:FastEthernet0/{n}', at))
    details.append(c.box(f'port-led-{n}', (3.0 * mm, 0.8 * mm, 1.5 * mm), (at[0], face - 0.1 * mm, at[2]), M['led-off']))
for name in ('GigabitEthernet0/1', 'GigabitEthernet0/2'):
    x, z = sockets[name]
    markers.append(c.marker(f'led:{name}', (x, face - 0.4 * mm, z + 12.8 * mm)))
    details.append(c.box(f'port-led-{name}', (3.0 * mm, 0.8 * mm, 1.5 * mm), (x, face - 0.1 * mm, z + 12.8 * mm), M['led-off']))

body = c.join([case, bezel, recess, *details, *labels], 'Catalyst-2960-24TT')
for m in markers:
    m.parent = body

out = c.args()
c.export_glb(out[0])
print('exported', out[0], 'faces', len(body.data.polygons))
if len(out) > 1:
    c.preview(out[1], target=(0.0, FRONT, 0.022), distance=0.95, angle=(-18, 10))
    if len(out) > 2:
        import bpy as _b
        cam = _b.context.scene.camera
        cam.data.lens = 120
        from mathutils import Vector as _V
        cam.location = _V((0.07, FRONT - 0.42, 0.06))
        cam.rotation_euler = (_V((0.07, FRONT, 0.022)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        _b.context.scene.render.filepath = out[2]
        _b.ops.render.render(write_still=True)
