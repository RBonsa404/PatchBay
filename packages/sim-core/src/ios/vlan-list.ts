export const MAX_VLAN = 4094;

/** Parse `10,20,30-40` into sorted unique ids (1-4094); null when malformed. */
export function parseVlanList(text: string): number[] | null {
  const ids = new Set<number>();
  for (const part of text.split(',')) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) return null;
    const from = Number(m[1]);
    const to = m[2] === undefined ? from : Number(m[2]);
    if (from < 1 || to > MAX_VLAN || from > to) return null;
    for (let i = from; i <= to; i++) ids.add(i);
  }
  return [...ids].sort((a, b) => a - b);
}

/** Inverse of parseVlanList: `1,10,20-22`. */
export function formatVlanList(ids: number[]): string {
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && (sorted[j + 1] as number) === (sorted[j] as number) + 1) j++;
    parts.push(j > i ? `${sorted[i]}-${sorted[j]}` : `${sorted[i]}`);
    i = j + 1;
  }
  return parts.join(',');
}

export const ALL_VLANS: readonly number[] = Array.from({ length: MAX_VLAN }, (_, i) => i + 1);
