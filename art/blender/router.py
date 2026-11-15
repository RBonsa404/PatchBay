"""Cisco 2911 (2U, 43.8 x 30.5 x 8.9 cm) and Cisco 1841 (1U, 34.3 x 27.4 x 4.4 cm) integrated services routers, port
side to the front as they are racked in a lab: interface cards with an HWIC-2T in slot 0 (two Smart Serial
connectors), Ethernet ports, console (light blue) and auxiliary ports, USB, CompactFlash, status LEDs.

    blender --background --factory-startup --python art/blender/router.py -- <2911|1841> <out.glb> [preview.png]
"""
import os
import sys

sys.path.append(os.path.dirname(__file__))
import common as c  # noqa: E402

model = c.args()[0]
SPECS = {
    '2911': {'W': 0.438, 'D': 0.305, 'H': 0.0889, 'eth': ['GigabitEthernet0/0', 'GigabitEthernet0/1', 'GigabitEthernet0/2'], 'name': 'Cisco 2911', 'eth_label': ['GE 0/0', 'GE 0/1', 'GE 0/2']},
    '1841': {'W': 0.343, 'D': 0.274, 'H': 0.0439, 'eth': ['FastEthernet0/0', 'FastEthernet0/1'], 'name': 'Cisco 1841', 'eth_label': ['FE 0/0', 'FE 0/1']},
}[model]
W, D, H = SPECS['W'], SPECS['D'], SPECS['H']
FRONT = -D / 2
mm = 0.001
TWO_U = model == '2911'

c.reset()
M = {
    'chassis': c.material('chassis', '#2b3138', 0.4, 0.8),
    'panel': c.material('panel', '#8796a5', 0.42, 0.55),
    'card': c.material('card', '#5d6c7b', 0.4, 0.6),
    'blank': c.material('blank', '#6f7e8c', 0.45, 0.6),
    'hole': c.material('hole', '#08090b', 0.8),
    'gold': c.material('gold', '#c9a646', 0.25, 1.0),
    'console': c.material('console', '#2fa7e0', 0.4, 0.1),
    'serial': c.material('serial', '#1b1f24', 0.55, 0.3),
    'screw': c.material('screw', '#c4ccd4', 0.3, 1.0),
    'print': c.material('print', '#f1f5f9', 0.5),
    'dark-print': c.material('dark-print', '#17202a', 0.5),
    'led-off': c.material('led-off', '#26313d', 0.3),
    'led-on': c.material('led-on', '#10b981', 0.3, 0, '#10b981', 6),
    'usb': c.material('usb', '#d9dee3', 0.3, 0.9),
    'vent': c.material('vent', '#0d1013', 0.7),
}

def x_mm(v):
    return v * mm - W / 2

face = FRONT
case = c.box('case', (W - 2 * mm, D - 4 * mm, H), (0, 2 * mm, H / 2), M['chassis'], bevel=1.2 * mm)
panel = c.box('panel', (W, 3 * mm, H), (0, FRONT + 1.5 * mm, H / 2), M['panel'], bevel=0.8 * mm)
parts, labels, markers, cuts = [case, panel], [], [], []

def rj45(name, x, z, ring=None, led=True, label=None):
    """A real socket: opening and latch notch cut through the panel, black well, eight gold contacts."""
    pw, ph = 11.7 * mm, 10.0 * mm
    cuts.append(c.box(f'cut-{name}', (pw, 20 * mm, ph), (x, face, z), M['hole']))
    cuts.append(c.box(f'notch-{name}', (6.0 * mm, 20 * mm, 2.2 * mm), (x, face, z - ph / 2 - 0.9 * mm), M['hole']))
    parts.append(c.box(f'well-{name}', (pw, 14 * mm, ph + 2.4 * mm), (x, face + 9.0 * mm, z - 0.6 * mm), M['hole']))
    for i in range(8):
        parts.append(c.box(f'pin-{name}-{i}', (0.55 * mm, 7 * mm, 0.5 * mm), (x - 3.6 * mm + i * 1.03 * mm, face + 6.5 * mm, z + ph / 2 - 1.2 * mm), M['gold']))
    if ring:
        r = c.box(f'ring-{name}', (pw + 3 * mm, 0.8 * mm, ph + 5.6 * mm), (x, face - 0.25 * mm, z - 0.8 * mm), M[ring])
        c.cut(r, [c.box(f'rh-{name}', (pw + 0.2 * mm, 3 * mm, ph + 0.2 * mm), (x, face, z + 0.8 * mm), M['hole']),
                  c.box(f'rn-{name}', (6.2 * mm, 3 * mm, 2.4 * mm), (x, face, z + 0.8 * mm - ph / 2 - 0.9 * mm), M['hole'])])
        parts.append(r)
    markers.append((f'port:{name}', (x, face - 4 * mm, z)))
    if led:
        at = (x + 4.2 * mm, face - 0.4 * mm, z + ph / 2 + 2.6 * mm)
        markers.append((f'led:{name}', at))
        parts.append(c.box(f'led-{name}', (2.6 * mm, 0.8 * mm, 1.4 * mm), (at[0], face - 0.1 * mm, at[2]), M['led-off']))
    if label:
        labels.append(c.text(f'lab-{name}', label, 1.7 * mm, (x, face - 0.15 * mm, z - ph / 2 - 3.6 * mm), M['dark-print']))

def smart_serial(name, x, z, label):
    """Smart Serial 26-pin: a D-shaped black shell with its contacts and two thumbscrew posts."""
    sw, sh = 22 * mm, 8.0 * mm
    shell = c.box(f'shell-{name}', (sw + 3 * mm, 3 * mm, sh + 3 * mm), (x, face - 1.2 * mm, z), M['serial'], bevel=1.0 * mm)
    c.cut(shell, [c.box(f'ssc-{name}', (sw, 10 * mm, sh), (x, face - 1.2 * mm, z), M['hole'])])
    parts.append(shell)
    parts.append(c.box(f'ssw-{name}', (sw, 8 * mm, sh), (x, face + 3 * mm, z), M['hole']))
    parts.append(c.box(f'ssp-{name}', (sw - 4 * mm, 4 * mm, 1.2 * mm), (x, face + 1.0 * mm, z), M['gold']))
    for dx in (-1, 1):
        parts.append(c.box(f'post-{name}-{dx}', (2.6 * mm, 2.4 * mm, 2.6 * mm), (x + dx * (sw / 2 + 4.5 * mm), face - 1.2 * mm, z), M['screw'], bevel=0.6 * mm))
    labels.append(c.text(f'lab-{name}', label, 1.7 * mm, (x, face - 0.15 * mm, z - sh / 2 - 3.8 * mm), M['print']))
    markers.append((f'port:{name}', (x, face - 4 * mm, z)))
    markers.append((f'led:{name}', (x + sw / 2 + 4.5 * mm, face - 2.6 * mm, z + sh / 2 + 2.4 * mm)))
    parts.append(c.box(f'led-{name}', (2.6 * mm, 0.8 * mm, 1.4 * mm), (x + sw / 2 + 4.5 * mm, face - 2.6 * mm, z + sh / 2 + 2.4 * mm), M['led-off']))

def card(x, z, w, h, name, filled):
    """An interface card slot: a plate with two captive screws, blank unless it carries the HWIC-2T."""
    plate = c.box(f'card-{name}', (w, 2.5 * mm, h), (x, face - 1.0 * mm, z), M['card' if filled else 'blank'], bevel=0.6 * mm)
    parts.append(plate)
    for dx in (-1, 1):
        parts.append(c.box(f'screw-{name}-{dx}', (3.6 * mm, 1.6 * mm, 3.6 * mm), (x + dx * (w / 2 - 4 * mm), face - 2.6 * mm, z), M['screw'], bevel=1.0 * mm))
    labels.append(c.text(f'cardname-{name}', name, 1.6 * mm, (x - w / 2 + 8 * mm, face - 2.4 * mm, z + h / 2 - 2.6 * mm), M['print'], align='LEFT'))

if TWO_U:
    # Four EHWIC slots in two rows on the left, the service module slot below them.
    slot_w, slot_h = 96 * mm, 21 * mm
    for i, (sx, sz) in enumerate(((60, 71), (160, 71), (60, 48), (160, 48))):
        card(x_mm(sx), sz * mm, slot_w, slot_h, f'EHWIC {i}' if i else 'HWIC-2T', i == 0)
    smart_serial('Serial0/0/0', x_mm(42), 69 * mm, 'S0/0/0')
    smart_serial('Serial0/0/1', x_mm(80), 69 * mm, 'S0/0/1')
    parts.append(c.box('sm-slot', (198 * mm, 2.5 * mm, 26 * mm), (x_mm(110), face - 1.0 * mm, 20 * mm), M['blank'], bevel=0.6 * mm))
    labels.append(c.text('sm-label', 'SM', 2.0 * mm, (x_mm(18), face - 2.4 * mm, 29 * mm), M['print'], align='LEFT'))
    # Ethernet ports, console and auxiliary, USB and CompactFlash on the right.
    for i, (name, lab) in enumerate(zip(SPECS['eth'], SPECS['eth_label'])):
        rj45(name, x_mm(258 + i * 22), 22 * mm, label=lab)
    rj45('Console', x_mm(258), 58 * mm, ring='console', led=False, label='CON')
    rj45('Auxiliary', x_mm(280), 58 * mm, led=False, label='AUX')
    for i in range(2):
        parts.append(c.box(f'usb-{i}', (12.5 * mm, 2 * mm, 5 * mm), (x_mm(312 + i * 16), face - 0.3 * mm, 58 * mm), M['usb'], bevel=0.4 * mm))
        cuts.append(c.box(f'usb-cut-{i}', (11 * mm, 10 * mm, 3.2 * mm), (x_mm(312 + i * 16), face, 58 * mm), M['hole']))
    for i in range(2):
        parts.append(c.box(f'cf-{i}', (40 * mm, 2 * mm, 4 * mm), (x_mm(390), face - 0.3 * mm, (52 + i * 10) * mm), M['blank'], bevel=0.5 * mm))
        labels.append(c.text(f'cf-l-{i}', f'CF{i}', 1.6 * mm, (x_mm(366), face - 0.15 * mm, (52 + i * 10) * mm), M['dark-print'], align='RIGHT'))
    for i, name in enumerate(('SYS', 'ACT', 'POE')):
        z = (80 - i * 6) * mm
        parts.append(c.box(f'sys-{name}', (3.2 * mm, 1.0 * mm, 1.7 * mm), (x_mm(410), face - 0.3 * mm, z), M['led-on'] if name == 'SYS' else M['led-off'], bevel=0.4 * mm))
        labels.append(c.text(f'sysl-{name}', name, 1.6 * mm, (x_mm(415), face - 0.15 * mm, z), M['dark-print'], align='LEFT'))
    labels.append(c.text('model', SPECS['name'], 2.6 * mm, (x_mm(330), face - 0.15 * mm, 80 * mm), M['dark-print']))
    tag = (x_mm(330), face - 0.2 * mm, 40 * mm)
else:
    # 1841: two HWIC slots on the left, Ethernet, console, auxiliary, USB and CompactFlash on the right, in one unit.
    card(x_mm(52), 22 * mm, 90 * mm, 34 * mm, 'HWIC-2T', True)
    card(x_mm(150), 22 * mm, 90 * mm, 34 * mm, 'HWIC 1', False)
    smart_serial('Serial0/0/0', x_mm(34), 20 * mm, 'S0/0/0')
    smart_serial('Serial0/0/1', x_mm(72), 20 * mm, 'S0/0/1')
    for i, (name, lab) in enumerate(zip(SPECS['eth'], SPECS['eth_label'])):
        rj45(name, x_mm(222 + i * 22), 22 * mm, label=lab)
    rj45('Console', x_mm(274), 22 * mm, ring='console', led=False, label='CON')
    rj45('Auxiliary', x_mm(296), 22 * mm, led=False, label='AUX')
    parts.append(c.box('usb', (12.5 * mm, 2 * mm, 5 * mm), (x_mm(320), face - 0.3 * mm, 30 * mm), M['usb'], bevel=0.4 * mm))
    parts.append(c.box('cf', (34 * mm, 2 * mm, 4 * mm), (x_mm(318), face - 0.3 * mm, 12 * mm), M['blank'], bevel=0.5 * mm))
    parts.append(c.box('sys', (3.2 * mm, 1.0 * mm, 1.7 * mm), (x_mm(207), face - 0.3 * mm, 36 * mm), M['led-on'], bevel=0.4 * mm))
    labels.append(c.text('sysl', 'SYS', 1.6 * mm, (x_mm(207), face - 0.15 * mm, 39.5 * mm), M['dark-print']))
    labels.append(c.text('model', SPECS['name'], 2.2 * mm, (x_mm(250), face - 0.15 * mm, 38.5 * mm), M['dark-print']))
    tag = (x_mm(318), face - 0.2 * mm, 38 * mm)

c.cut(panel, [c.box(f'{k.name}-p', k.dimensions, k.location, M['hole']) for k in cuts])
for k in cuts:
    c.bpy.data.objects.remove(k, do_unlink=True)

# Vents along the sides.
vents = [c.box(f'vent-{s}-{i}', (6 * mm, 3.2 * mm, H * 0.45), (s * W / 2, -D / 2 + 40 * mm + i * 8 * mm, H / 2), M['hole']) for s in (-1, 1) for i in range(int((D - 80 * mm) / (8 * mm)))]
c.cut(case, vents)

body = c.join(parts + labels, f'Cisco-{model}')
for name, at in markers:
    c.attach(c.marker(name, at), body)
c.attach(c.marker('tag', tag), body)

out = c.args()[1:]
c.export_glb(out[0])
print('exported', out[0], 'faces', len(body.data.polygons))
if len(out) > 1:
    c.preview(out[1], target=(0.0, FRONT, H / 2), distance=0.85, angle=(-20, 12))
