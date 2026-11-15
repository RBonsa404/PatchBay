import { DOORS, FLOOR_Y, ROOMS, SITE_Z, siteOf, ZONES, type ZoneName } from '../scene/building.js';
import { h, ui } from './dom.js';

/**
 * A plan of the floor the player is on, in a corner of the screen: the rooms with their names, the doors, where the
 * player stands and which way they look. N hides it or shows it again.
 */

const SHORT: Record<ZoneName, string> = {
  room: 'Technique',
  lab: 'Salle de TP',
  corridor: '',
  corridor1: '',
  stairs: 'Escalier',
  office: 'Administration',
  classroom0: 'Cours 001',
  toilets: 'WC',
  lounge: 'Détente',
  classroom1: 'Cours 101',
  classroom2: 'Cours 102',
  agence: 'Salle informatique',
  datacenter: 'Salle des serveurs',
  'agence-corridor': '',
  'agence-hall': 'Accueil',
  'agence-office': 'Direction',
  'agence-meeting': 'Réunion',
  'agence-toilets': 'WC',
  'datacenter-corridor': '',
  'datacenter-hall': 'Accueil',
  'datacenter-office': 'Exploitation',
  'datacenter-meeting': 'Réunion',
  'datacenter-toilets': 'WC',
};

/** Rooms where the work is: drawn brighter than the rest. */
const WORK = new Set<ZoneName>(['room', 'lab', 'office', 'agence', 'datacenter']);

const X0 = -14.4;
const X1 = 13.0;
const Z0 = -12.1;
const Z1 = 6.4;
const SCALE = 9;

export class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private last = '';

  constructor(private readonly upstairs: boolean) {
    this.canvas = h('canvas', { width: String(Math.round((X1 - X0) * SCALE * 2)), height: String(Math.round((Z1 - Z0) * SCALE * 2)), 'aria-hidden': 'true' });
    this.title = h('span', { class: 'label' }, 'Rez-de-chaussée');
    this.root = h('aside', { class: 'minimap panel-solid', title: 'Plan du bâtiment (C pour masquer)' }, this.title, this.canvas);
    ui().append(this.root);
  }

  toggle(): void {
    this.root.classList.toggle('hidden');
  }

  /** Draw again if the player moved or turned enough to see it. */
  update(x: number, z: number, yaw: number, floorY: number, zone: ZoneName): void {
    const key = `${x.toFixed(1)}|${z.toFixed(1)}|${yaw.toFixed(1)}|${floorY > 1 ? 1 : 0}|${zone}`;
    if (key === this.last || this.root.classList.contains('hidden')) return;
    this.last = key;
    const upper = floorY > FLOOR_Y - 0.5;
    this.title.textContent = siteOf(z) === 'agence' ? 'Bobo-Dioulasso' : siteOf(z) === 'datacenter' ? 'Opérateur' : upper ? 'Étage 1' : 'Rez-de-chaussée';
    const c = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    const k = SCALE * 2;
    const site = siteOf(z);
    const shift = site === 'campus' ? 0 : SITE_Z[site];
    const px = (v: number): number => (v - X0) * k;
    const pz = (v: number): number => (v - shift - Z0) * k;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const floor = upper ? FLOOR_Y : 0;
    const zones = ZONES.filter((zn) => zn.name === 'stairs' || zn.y === floor)
      .filter((zn) => this.upstairs || zn.name !== 'stairs')
      .filter((zn) => siteOf(zn.rect.z0) === site);
    for (const zn of zones) {
      const r = zn.rect;
      const here = zn.name === zone;
      const corridor = zn.name === 'corridor' || zn.name === 'corridor1' || zn.name.endsWith('-corridor');
      c.fillStyle = here ? 'rgba(251, 191, 36, 0.28)' : corridor ? 'rgba(148, 163, 184, 0.16)' : WORK.has(zn.name) ? 'rgba(59, 130, 246, 0.3)' : 'rgba(148, 163, 184, 0.24)';
      c.fillRect(px(r.x0), pz(r.z0), (r.x1 - r.x0) * k, (r.z1 - r.z0) * k);
      c.strokeStyle = 'rgba(226, 232, 240, 0.75)';
      c.lineWidth = 3;
      c.strokeRect(px(r.x0), pz(r.z0), (r.x1 - r.x0) * k, (r.z1 - r.z0) * k);
    }
    // Doorways: gaps in the outlines.
    c.strokeStyle = 'rgba(11, 18, 32, 1)';
    c.lineWidth = 6;
    for (const d of DOORS) {
      if (Math.abs(d.y - floor) > 0.01) continue;
      if (d.x >= ROOMS.corridor.x1 - 0.01 && !this.upstairs) continue;
      c.beginPath();
      if (d.along === 'x') {
        c.moveTo(px(d.x - d.width / 2), pz(d.z));
        c.lineTo(px(d.x + d.width / 2), pz(d.z));
      } else {
        c.moveTo(px(d.x), pz(d.z - d.width / 2));
        c.lineTo(px(d.x), pz(d.z + d.width / 2));
      }
      c.stroke();
    }
    c.font = '600 22px Poppins, system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const zn of zones) {
      const label = SHORT[zn.name];
      if (!label) continue;
      const r = zn.rect;
      c.fillStyle = zn.name === zone ? '#fde68a' : WORK.has(zn.name) ? '#e2e8f0' : '#94a3b8';
      c.fillText(label, px((r.x0 + r.x1) / 2), pz((r.z0 + r.z1) / 2), (r.x1 - r.x0) * k - 8);
    }
    // The player: a dot and the cone of what they see.
    const [cx, cz] = [px(x), pz(z)];
    const dir = [Math.sin(yaw), Math.cos(yaw)] as const;
    const grad = c.createRadialGradient(cx, cz, 4, cx, cz, 70);
    grad.addColorStop(0, 'rgba(251, 191, 36, 0.55)');
    grad.addColorStop(1, 'rgba(251, 191, 36, 0)');
    c.fillStyle = grad;
    c.beginPath();
    c.moveTo(cx, cz);
    const a = Math.atan2(dir[1], dir[0]);
    c.arc(cx, cz, 70, a - 0.6, a + 0.6);
    c.closePath();
    c.fill();
    c.fillStyle = '#fbbf24';
    c.strokeStyle = '#0b1220';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(cx, cz, 9, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }

  destroy(): void {
    this.root.remove();
  }
}
