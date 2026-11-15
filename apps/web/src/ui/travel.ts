import { ArrowLeft, Building2, MapPin, Server } from 'lucide';
import type { SiteName } from '../scene/building.js';
import { icon } from './brand.js';
import { h, ui } from './dom.js';

/**
 * Going from one site to another: the choice of destination, then the trip shown on the map of Burkina Faso, the
 * route drawn from the campus to the far building, with its distance. The far building is really far: what joins
 * them is the operator's leased line.
 */

export interface SiteInfo {
  name: string;
  city: string;
  detail: string;
  /** Longitude, latitude. */
  at: [number, number];
}

export const SITES: Record<SiteName, SiteInfo> = {
  campus: { name: 'Campus de l’IST', city: 'Ouagadougou', detail: 'Salle technique, salle de TP, administration', at: [-1.52, 12.37] },
  agence: { name: 'Agence de Bobo-Dioulasso', city: 'Bobo-Dioulasso', detail: 'Le site distant, relié par une ligne louée', at: [-4.3, 11.18] },
  datacenter: { name: 'Centre de données de l’opérateur', city: 'Ouagadougou, zone industrielle', detail: 'Le fournisseur d’accès à Internet', at: [-1.47, 12.32] },
};

/** Road distance between two sites, in kilometres. */
export function distanceKm(a: SiteName, b: SiteName): number {
  const [x1, y1] = SITES[a].at;
  const [x2, y2] = SITES[b].at;
  const km = Math.hypot((x2 - x1) * 109, (y2 - y1) * 111);
  return Math.round(km * 1.18);
}

// Burkina Faso, simplified: enough to recognise the country and place its two big cities.
const OUTLINE: [number, number][] = [
  [-5.52, 10.44], [-5.4, 11.0], [-5.2, 11.4], [-4.75, 11.95], [-4.4, 12.7], [-3.95, 13.4], [-3.4, 13.7], [-2.9, 13.65], [-2.0, 14.2],
  [-1.7, 14.5], [-0.8, 15.08], [0.25, 14.95], [0.6, 14.5], [0.95, 13.9], [1.05, 13.3], [0.95, 13.05], [2.17, 12.7], [2.4, 12.25],
  [2.1, 11.75], [1.4, 11.45], [0.9, 11.0], [0.0, 11.0], [-0.6, 10.95], [-1.1, 11.0], [-2.9, 9.9], [-3.6, 9.9], [-4.3, 9.6], [-4.7, 9.7],
  [-5.0, 10.2],
];

const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag: string, attrs: Record<string, string>): SVGElement => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};
const project = ([lon, lat]: [number, number]): [number, number] => [(lon + 6) * 100, (15.5 - lat) * 100];

/** The list of sites to go to; `go` is called with the chosen one. */
export function showSiteChooser(here: SiteName, sites: SiteName[], go: (site: SiteName) => void, cancel: () => void): void {
  const close = (): void => screen.remove();
  const glyph = { campus: Building2, agence: MapPin, datacenter: Server } as const;
  const screen: HTMLElement = h(
    'div',
    { class: 'pause-screen', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Changer de site' },
    h(
      'div',
      { class: 'pause-card travel-card' },
      h('span', { class: 'label' }, 'Changer de site'),
      h('h2', {}, `Vous êtes : ${SITES[here].name}`),
      h(
        'nav',
        { class: 'menu' },
        ...sites
          .filter((s) => s !== here)
          .map((s) =>
            h(
              'button',
              { class: 'menu-item site-item', onclick: () => { close(); go(s); } },
              icon(glyph[s], 20),
              h('span', { class: 'site-text' }, h('strong', {}, SITES[s].name), h('small', {}, `${SITES[s].city} · ${distanceKm(here, s)} km · ${SITES[s].detail}`)),
            ),
          ),
        h('button', { class: 'menu-item', onclick: () => { close(); cancel(); } }, icon(ArrowLeft, 20), h('span', {}, 'Rester ici')),
      ),
    ),
  );
  ui().append(screen);
}

/**
 * The trip, over the map: the country, the two sites, the route drawn as the dot moves along it, the distance counted
 * up. `arrive` is called at the end, while the screen is still covered, for the scene to move behind it.
 */
export function playTrip(from: SiteName, to: SiteName, arrive: () => void, done: () => void): void {
  const km = distanceKm(from, to);
  const seconds = km > 50 ? 4.2 : 2.6;
  const map = svg('svg', { viewBox: '0 0 900 620', class: 'trip-map' });
  map.append(svg('path', { d: `M${OUTLINE.map(project).map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join(' L')} Z`, class: 'country' }));
  const [a, b] = [project(SITES[from].at), project(SITES[to].at)];
  // A gentle curve, as a road would go.
  const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - Math.max(30, Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.18)];
  const route = svg('path', { d: `M${a[0]},${a[1]} Q${mid[0]},${mid[1]} ${b[0]},${b[1]}`, class: 'route' }) as SVGPathElement;
  const line = svg('path', { d: `M${a[0]},${a[1]} Q${mid[0]},${mid[1]} ${b[0]},${b[1]}`, class: 'leased' });
  map.append(line, route);
  for (const [site, p] of [[from, a], [to, b]] as const) {
    map.append(svg('circle', { cx: String(p[0]), cy: String(p[1]), r: '9', class: 'site' }));
    const label = svg('text', { x: String(p[0] + (site === 'agence' ? -16 : 16)), y: String(p[1] - 14), class: 'site-label', 'text-anchor': site === 'agence' ? 'end' : 'start' });
    label.textContent = SITES[site].city.split(',')[0] as string;
    map.append(label);
  }
  const dot = svg('circle', { r: '7', class: 'traveller' });
  map.append(dot);
  const counter = h('strong', { class: 'trip-km' }, '0 km');
  const screen = h(
    'div',
    { class: 'trip-screen' },
    h('div', { class: 'trip-head' }, h('span', { class: 'label' }, 'En route'), h('h2', {}, `${SITES[from].name}  →  ${SITES[to].name}`)),
    map,
    h('div', { class: 'trip-foot' }, counter, h('span', {}, km > 50 ? 'Entre les deux sites, une seule liaison : la ligne louée de l’opérateur.' : 'Le fournisseur d’accès est dans la même ville : sa fibre arrive au campus.')),
  );
  ui().append(screen);
  const length = route.getTotalLength();
  route.style.strokeDasharray = `${length}`;
  const start = performance.now();
  const step = (now: number): void => {
    const t = Math.min(1, (now - start) / (seconds * 1000));
    const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    route.style.strokeDashoffset = `${length * (1 - eased)}`;
    const p = route.getPointAtLength(length * eased);
    dot.setAttribute('cx', String(p.x));
    dot.setAttribute('cy', String(p.y));
    counter.textContent = `${Math.round(km * eased)} km`;
    if (t < 1) requestAnimationFrame(step);
    else {
      arrive();
      setTimeout(() => {
        screen.classList.add('leaving');
        setTimeout(() => {
          screen.remove();
          done();
        }, 600);
      }, 500);
    }
  };
  requestAnimationFrame(step);
}
