// IPv4 helpers on dotted-quad strings. All arithmetic stays unsigned (JS bitwise operators are signed 32-bit).

export const ipToInt = (ip: string): number => ip.split('.').reduce((n, octet) => n * 256 + Number(octet), 0);

export const intToIp = (n: number): string =>
  [24, 16, 8, 0].map((shift) => Math.floor(n / 2 ** shift) % 256).join('.');

const prefixMask = (len: number): number => (len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0);

export const prefixToMask = (len: number): string => intToIp(prefixMask(len));

/** Prefix length of a netmask, or null when the mask is not contiguous (255.0.255.0). */
export function maskToPrefix(mask: string): number | null {
  const m = ipToInt(mask);
  for (let len = 0; len <= 32; len++) if (m === prefixMask(len)) return len;
  return null;
}

export const networkOf = (ip: string, mask: string): string => intToIp((ipToInt(ip) & ipToInt(mask)) >>> 0);

export const sameSubnet = (a: string, b: string, mask: string): boolean => networkOf(a, mask) === networkOf(b, mask);
