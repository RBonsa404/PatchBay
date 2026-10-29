import { createElement, type IconNode } from 'lucide';
import clubLogo160 from '../assets/club-logo-160.webp';
import { h } from './dom.js';

/**
 * Visual identity: the PatchBay mark (a network socket with its link LED, in the club's colours), the club badge,
 * the mentor's portrait, and icons from Lucide (ISC licence, see ASSETS.md). SVG sources are constants of this file,
 * never user data.
 */

const svg = (source: string): SVGElement => {
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  return document.importNode(doc.documentElement, true) as unknown as SVGElement;
};

/** The PatchBay mark: a royal-blue tile holding an RJ45 socket, gold contacts and a green link LED. */
export const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="PatchBay">
  <rect width="64" height="64" rx="14" fill="#1D4ED8"/>
  <rect x="12" y="14" width="40" height="36" rx="5" fill="#F8FAFC"/>
  <path d="M19 21h26v17h-6v6H25v-6h-6z" fill="#0B1E3F"/>
  <g fill="#FBBF24"><rect x="22.5" y="22" width="2" height="7" rx="1"/><rect x="26.5" y="22" width="2" height="7" rx="1"/><rect x="30.5" y="22" width="2" height="7" rx="1"/><rect x="34.5" y="22" width="2" height="7" rx="1"/><rect x="38.5" y="22" width="2" height="7" rx="1"/></g>
  <circle cx="46" cy="46" r="3" fill="#10B981"/>
</svg>`;

export function logo(size: 'large' | 'small' = 'large'): HTMLElement {
  return h('div', { class: `brand brand-${size}` }, svg(MARK_SVG), h('span', { class: 'wordmark' }, 'Patch', h('b', {}, 'Bay')));
}

export function clubBadge(): HTMLElement {
  return h('img', { class: 'club-badge', src: clubLogo160, alt: "Logo du Club Informatique de l'IST", width: '64', height: '64' });
}

/** The club's network trainer who briefs the player and runs the tutorial. */
export const MENTOR = { name: 'Aïcha', role: 'Formatrice réseau du club' } as const;

const MENTOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="Aïcha">
  <rect width="96" height="96" rx="48" fill="#1D4ED8"/>
  <path d="M14 96c2-20 16-30 34-30s32 10 34 30z" fill="#F8FAFC"/>
  <path d="M38 66l10 10 10-10" fill="none" stroke="#FBBF24" stroke-width="4" stroke-linejoin="round"/>
  <rect x="42" y="56" width="12" height="12" rx="4" fill="#7A4A2A"/>
  <ellipse cx="48" cy="44" rx="15" ry="17" fill="#8B5532"/>
  <path d="M31 42c0-14 8-22 17-22s17 8 17 22c-3-6-7-9-11-10-4 4-12 6-23 10z" fill="#1A1210"/>
  <path d="M30 34c2-12 10-18 18-18 10 0 18 7 19 18-6-5-12-7-19-7s-13 2-18 7z" fill="#FBBF24"/>
  <path d="M30 34c5-5 11-7 18-7s13 2 19 7" fill="none" stroke="#D97706" stroke-width="2"/>
  <circle cx="42" cy="45" r="1.8" fill="#1A1210"/><circle cx="54" cy="45" r="1.8" fill="#1A1210"/>
  <path d="M43 53c3 2.5 7 2.5 10 0" fill="none" stroke="#1A1210" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M31 46a17 17 0 0 1 34 0" fill="none" stroke="#0B1E3F" stroke-width="3"/>
  <rect x="28" y="42" width="6" height="11" rx="3" fill="#0B1E3F"/><rect x="62" y="42" width="6" height="11" rx="3" fill="#0B1E3F"/>
  <path d="M31 52c0 6 4 9 11 9" fill="none" stroke="#0B1E3F" stroke-width="2"/><circle cx="43" cy="61" r="2" fill="#0B1E3F"/>
</svg>`;

export function mentorPortrait(): SVGElement {
  const el = svg(MENTOR_SVG);
  el.classList.add('mentor-portrait');
  return el;
}

/** A Lucide icon, sized in pixels, inheriting the text colour. */
export function icon(node: IconNode, size = 18): SVGElement {
  const el = createElement(node);
  el.setAttribute('width', String(size));
  el.setAttribute('height', String(size));
  el.setAttribute('aria-hidden', 'true');
  el.classList.add('icon');
  return el;
}
