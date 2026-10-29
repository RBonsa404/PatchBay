import type { DeviceProfile } from './profiles.js';

export interface ResolvedInterface {
  name: string;
  /** Number of input tokens used: 1 for `fa0/0`, 2 for `fastethernet 0/0`. */
  consumed: number;
}

/** Resolve user input such as `fa0/0`, `Gi 0/1` or `fastethernet 0/0` to a canonical interface name. */
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
  if (!group || !group.ids.includes(number)) return null;
  return { name: group.type + number, consumed };
}
