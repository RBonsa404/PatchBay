import type { DeviceProfile } from './profiles.js';

export interface ResolvedInterface {
  name: string;
  /** Number of input tokens used: 1 for `fa0/0`, 2 for `fastethernet 0/0`. */
  consumed: number;
}

/** `FastEthernet0/1.10` -> `FastEthernet0/1`; undefined for anything that is not a subinterface. */
export const parentOf = (interfaceName: string): string | undefined => /^(.+)\.\d+$/.exec(interfaceName)?.[1];

/**
 * Resolve user input such as `fa0/0`, `Gi 0/1`, `fastethernet 0/0` or `vlan 99` to a canonical interface name.
 * SVIs (type Vlan) accept any id 1-4094: IOS creates them on demand.
 */
export function resolveInterface(profile: DeviceProfile, tokens: string[]): ResolvedInterface | null {
  const first = tokens[0];
  if (first === undefined) return null;
  const m = /^([a-zA-Z]+)(\d.*)?$/.exec(first);
  if (!m) return null;

  const typePart = (m[1] as string).toLowerCase();
  let number = m[2];
  let consumed = 1;
  if (number === undefined) {
    number = tokens[1];
    consumed = 2;
    if (number === undefined) return null;
  }

  const groups = profile.groups.filter((g) => g.type.toLowerCase().startsWith(typePart));
  const group = groups.length === 1 ? groups[0] : undefined;
  if (!group) return null;

  // Subinterfaces (router Ethernet only): fa0/1.10
  const dot = number.indexOf('.');
  if (dot >= 0) {
    const base = number.slice(0, dot);
    const sub = number.slice(dot + 1);
    const ok = group.kind === 'ethernet' && group.layer === 3 && group.ids.includes(base) && /^\d+$/.test(sub) && Number(sub) >= 1 && Number(sub) <= 4294967293;
    return ok ? { name: `${group.type}${base}.${Number(sub)}`, consumed } : null;
  }

  if (group.kind === 'svi') {
    return /^\d+$/.test(number) && Number(number) >= 1 && Number(number) <= 4094 ? { name: group.type + Number(number), consumed } : null;
  }
  if (group.kind === 'loopback') {
    return /^\d+$/.test(number) && Number(number) <= 2147483647 ? { name: group.type + Number(number), consumed } : null;
  }
  return group.ids.includes(number) ? { name: group.type + number, consumed } : null;
}

/**
 * Parse the argument of `interface range`: `fa0/1-24`, `fa0/1 - 5 , fa0/10`, `fastethernet 0/1 - 3`.
 * Returns canonical names in order, or null when anything is unknown or reversed.
 */
export function parseInterfaceRange(profile: DeviceProfile, text: string): string[] | null {
  const names: string[] = [];
  for (const raw of text.split(',')) {
    const part = raw.trim().replace(/\s*-\s*/g, '-').replace(/^([a-zA-Z]+)\s+(\d)/, '$1$2');
    const m = /^([a-zA-Z]+)(\d+(?:\/\d+)*)\/(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) return null;
    const [, type, slot, firstPort, lastPort] = m as unknown as [string, string, string, string, string | undefined];
    const first = Number(firstPort);
    const last = lastPort === undefined ? first : Number(lastPort);
    if (first > last) return null;
    for (let n = first; n <= last; n++) {
      const r = resolveInterface(profile, [`${type}${slot}/${n}`]);
      if (!r) return null;
      names.push(r.name);
    }
  }
  return names.length > 0 ? names : null;
}
