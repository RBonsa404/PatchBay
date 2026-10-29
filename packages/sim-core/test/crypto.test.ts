import { describe, expect, it } from 'vitest';
import { enableSecretHash, md5, toHex, type7Encrypt } from '../src/ios/crypto.js';

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe('md5', () => {
  it('matches the RFC 1321 test vectors', () => {
    expect(toHex(md5(ascii('')))).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(toHex(md5(ascii('abc')))).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(toHex(md5(ascii('12345678901234567890123456789012345678901234567890123456789012345678901234567890')))).toBe(
      '57edf4a22be3c955ac49da2e2107b67a',
    );
  });
});

describe('IOS password encodings', () => {
  it('produces the well-known type 5 hash for "cisco" with salt mERr', () => {
    expect(enableSecretHash('cisco')).toBe('$1$mERr$hx5rVt7rPNoS4wqbXKX7m0');
  });

  it('produces the well-known type 7 string for "cisco" with seed 07', () => {
    expect(type7Encrypt('cisco', 7)).toBe('070C285F4D06');
  });
});
