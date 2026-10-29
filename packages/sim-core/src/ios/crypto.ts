// Pure-TypeScript implementations of the password encodings IOS shows in `show running-config`.
// No Node/DOM APIs: sim-core must run unchanged in browsers, workers and tests.

const MD5_SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11,
  16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0);

const rotl = (x: number, c: number): number => ((x << c) | (x >>> (32 - c))) >>> 0;

export function md5(data: Uint8Array): Uint8Array {
  const len = data.length;
  const total = (((len + 8) >> 6) + 1) << 6;
  const buf = new Uint8Array(total);
  buf.set(data);
  buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, (len * 8) >>> 0, true);
  dv.setUint32(total - 4, Math.floor(len / 536870912), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let off = 0; off < total; off += 64) {
    const m = Array.from({ length: 16 }, (_, i) => dv.getUint32(off + i * 4, true));
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      f = (f + a + (MD5_K[i] as number) + (m[g] as number)) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + rotl(f, MD5_SHIFTS[i] as number)) >>> 0;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const out = new Uint8Array(16);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, a0, true);
  odv.setUint32(4, b0, true);
  odv.setUint32(8, c0, true);
  odv.setUint32(12, d0, true);
  return out;
}

const bytesOf = (s: string): Uint8Array => Uint8Array.from(s, (ch) => ch.charCodeAt(0) & 0xff);

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const ITOA64 = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function to64(value: number, n: number): string {
  let v = value;
  let s = '';
  for (let i = 0; i < n; i++) {
    s += ITOA64.charAt(v & 0x3f);
    v >>>= 6;
  }
  return s;
}

/** FreeBSD md5-crypt, the `$1$salt$hash` format of `enable secret 5`. */
export function md5Crypt(password: string, salt: string): string {
  const pw = bytesOf(password);
  const sl = bytesOf(salt);
  const alt = md5(concat(pw, sl, pw));

  const ctx: Uint8Array[] = [pw, bytesOf('$1$'), sl];
  for (let pl = pw.length; pl > 0; pl -= 16) ctx.push(alt.subarray(0, Math.min(16, pl)));
  for (let i = pw.length; i > 0; i >>= 1) ctx.push(i & 1 ? new Uint8Array([0]) : pw.subarray(0, 1));

  let final = md5(concat(...ctx));
  for (let i = 0; i < 1000; i++) {
    const parts: Uint8Array[] = [i & 1 ? pw : final];
    if (i % 3) parts.push(sl);
    if (i % 7) parts.push(pw);
    parts.push(i & 1 ? final : pw);
    final = md5(concat(...parts));
  }

  const f = (i: number): number => final[i] as number;
  return (
    `$1$${salt}$` +
    to64((f(0) << 16) | (f(6) << 8) | f(12), 4) +
    to64((f(1) << 16) | (f(7) << 8) | f(13), 4) +
    to64((f(2) << 16) | (f(8) << 8) | f(14), 4) +
    to64((f(3) << 16) | (f(9) << 8) | f(15), 4) +
    to64((f(4) << 16) | (f(10) << 8) | f(5), 4) +
    to64(f(11), 2)
  );
}

/** Fixed salt: IOS picks a random one, but the simulator must be deterministic. */
const SECRET_SALT = 'mERr';

export const enableSecretHash = (password: string): string => md5Crypt(password, SECRET_SALT);

const TYPE7_TABLE = 'dsfd;kfoA,.iyewrkldJKDHSUBsgvca69834ncxv9873254k;fg87';

export function type7Encrypt(password: string, seed: number = password.length % 16): string {
  let out = seed.toString().padStart(2, '0');
  for (let i = 0; i < password.length; i++) {
    const key = TYPE7_TABLE.charCodeAt((seed + i) % TYPE7_TABLE.length);
    out += ((password.charCodeAt(i) ^ key) & 0xff).toString(16).toUpperCase().padStart(2, '0');
  }
  return out;
}
