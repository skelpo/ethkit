import { hmacSha256 } from './hmac.js';

const P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn;
const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const Gx = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n;
const Gy = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n;
const HALF_N = N >> 1n;

export interface Signature {
  r: bigint;
  s: bigint;
  recovery: number;
}

interface JacobianPoint {
  x: bigint;
  y: bigint;
  z: bigint;
}

const ZERO: JacobianPoint = { x: 0n, y: 1n, z: 0n };

function mod(a: bigint, m: bigint): bigint {
  const r = a % m;
  return r < 0n ? r + m : r;
}

function modPow(base: bigint, exp: bigint, m: bigint): bigint {
  let result = 1n;
  base = mod(base, m);
  while (exp > 0n) {
    if (exp & 1n) {
      result = mod(result * base, m);
    }
    exp >>= 1n;
    base = mod(base * base, m);
  }
  return result;
}

function modInverse(a: bigint, m: bigint): bigint {
  return modPow(a, m - 2n, m);
}

function isZero(p: JacobianPoint): boolean {
  return p.z === 0n;
}

function pointDouble(p: JacobianPoint): JacobianPoint {
  if (isZero(p)) return ZERO;
  if (p.y === 0n) return ZERO;

  const px = p.x;
  const py = p.y;
  const pz = p.z;

  const ysq = mod(py * py, P);
  const s = mod(4n * px * ysq, P);
  const m = mod(3n * px * px, P);
  const nx = mod(m * m - 2n * s, P);
  const ny = mod(m * (s - nx) - 8n * ysq * ysq, P);
  const nz = mod(2n * py * pz, P);

  return { x: nx, y: ny, z: nz };
}

function pointAdd(p1: JacobianPoint, p2: JacobianPoint): JacobianPoint {
  if (isZero(p1)) return p2;
  if (isZero(p2)) return p1;

  const p1z2 = mod(p1.z * p1.z, P);
  const p2z2 = mod(p2.z * p2.z, P);
  const u1 = mod(p1.x * p2z2, P);
  const u2 = mod(p2.x * p1z2, P);
  const s1 = mod(p1.y * p2z2 * p2.z, P);
  const s2 = mod(p2.y * p1z2 * p1.z, P);

  if (u1 === u2) {
    if (s1 === s2) return pointDouble(p1);
    return ZERO;
  }

  const h = mod(u2 - u1, P);
  const r = mod(s2 - s1, P);
  const h2 = mod(h * h, P);
  const h3 = mod(h * h2, P);

  const nx = mod(r * r - h3 - 2n * u1 * h2, P);
  const ny = mod(r * (u1 * h2 - nx) - s1 * h3, P);
  const nz = mod(h * p1.z * p2.z, P);

  return { x: nx, y: ny, z: nz };
}

function pointMultiply(point: JacobianPoint, scalar: bigint): JacobianPoint {
  let result: JacobianPoint = ZERO;
  let current: JacobianPoint = point;
  let k = scalar;
  while (k > 0n) {
    if (k & 1n) {
      result = pointAdd(result, current);
    }
    current = pointDouble(current);
    k >>= 1n;
  }
  return result;
}

function toAffine(p: JacobianPoint): { x: bigint; y: bigint } {
  if (isZero(p)) {
    return { x: 0n, y: 0n };
  }
  const zinv = modInverse(p.z, P);
  const zinv2 = mod(zinv * zinv, P);
  const zinv3 = mod(zinv2 * zinv, P);
  return {
    x: mod(p.x * zinv2, P),
    y: mod(p.y * zinv3, P),
  };
}

const G: JacobianPoint = { x: Gx, y: Gy, z: 1n };

function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result;
}

function bytesRangeToBigInt(bytes: Uint8Array, start: number, end: number): bigint {
  let result = 0n;
  for (let i = start; i < end; i++) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result;
}

function bigIntToBytes(n: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let val = n;
  for (let i = length - 1; i >= 0; i--) {
    bytes[i] = Number(val & 0xFFn);
    val >>= 8n;
  }
  return bytes;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  let totalLen = 0;
  for (let i = 0; i < arrays.length; i++) {
    totalLen += arrays[i].length;
  }
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (let i = 0; i < arrays.length; i++) {
    const arr = arrays[i];
    for (let j = 0; j < arr.length; j++) {
      result[offset + j] = arr[j];
    }
    offset += arr.length;
  }
  return result;
}

function rfc6979(msgHash: Uint8Array, privateKey: Uint8Array): bigint {
  let v: Uint8Array = new Uint8Array(32);
  for (let i = 0; i < 32; i++) v[i] = 0x01;
  let k: Uint8Array = new Uint8Array(32);

  const zero: Uint8Array = new Uint8Array(1);
  zero[0] = 0x00;
  const one: Uint8Array = new Uint8Array(1);
  one[0] = 0x01;

  k = hmacSha256(k, concatBytes(v, zero, privateKey, msgHash));
  v = hmacSha256(k, v);
  k = hmacSha256(k, concatBytes(v, one, privateKey, msgHash));
  v = hmacSha256(k, v);

  while (true) {
    v = hmacSha256(k, v);
    const candidate = bytesToBigInt(v);
    if (candidate >= 1n && candidate < N) {
      return candidate;
    }
    k = hmacSha256(k, concatBytes(v, zero));
    v = hmacSha256(k, v);
  }
}

export function getPublicKey(privateKey: Uint8Array, compressed?: boolean): Uint8Array {
  const d = bytesToBigInt(privateKey);
  const pub = toAffine(pointMultiply(G, d));

  if (compressed === true) {
    const prefix = (pub.y & 1n) === 0n ? 0x02 : 0x03;
    const xBytes = bigIntToBytes(pub.x, 32);
    const result = new Uint8Array(33);
    result[0] = prefix;
    for (let i = 0; i < 32; i++) result[1 + i] = xBytes[i];
    return result;
  }

  const xBytes = bigIntToBytes(pub.x, 32);
  const yBytes = bigIntToBytes(pub.y, 32);
  const result = new Uint8Array(65);
  result[0] = 0x04;
  for (let i = 0; i < 32; i++) result[1 + i] = xBytes[i];
  for (let i = 0; i < 32; i++) result[33 + i] = yBytes[i];
  return result;
}

export function sign(msgHash: Uint8Array, privateKey: Uint8Array, opts?: { lowS?: boolean }): Signature {
  const lowS = opts === undefined || opts.lowS === undefined ? true : opts.lowS;
  const z = bytesToBigInt(msgHash);
  const d = bytesToBigInt(privateKey);
  const k = rfc6979(msgHash, privateKey);

  const kPoint = toAffine(pointMultiply(G, k));
  const r = mod(kPoint.x, N);
  if (r === 0n) throw new Error('invalid signature: r=0');

  const kInv = modInverse(k, N);
  let s = mod(kInv * (z + r * d), N);
  if (s === 0n) throw new Error('invalid signature: s=0');

  let recovery = ((kPoint.y & 1n) === 0n ? 0 : 1) ^ (kPoint.x !== r ? 2 : 0);

  if (lowS && s > HALF_N) {
    s = N - s;
    recovery ^= 1;
  }

  return { r, s, recovery };
}

export function recoverPublicKey(msgHash: Uint8Array, sig: { r: bigint; s: bigint }, recovery: number): Uint8Array {
  const r = sig.r;
  const s = sig.s;
  const isOddY = (recovery & 1) !== 0;

  const x = r;
  const ySquared = mod(modPow(x, 3n, P) + 7n, P);
  let y = modPow(ySquared, (P + 1n) / 4n, P);

  if (((y & 1n) === 1n) !== isOddY) {
    y = P - y;
  }

  const R: JacobianPoint = { x, y, z: 1n };
  const z = bytesToBigInt(msgHash);
  const rInv = modInverse(r, N);

  const u1 = mod(-z * rInv, N);
  const u2 = mod(s * rInv, N);

  const point = pointAdd(pointMultiply(G, u1), pointMultiply(R, u2));
  const aff = toAffine(point);

  const pubX = bigIntToBytes(aff.x, 32);
  const pubY = bigIntToBytes(aff.y, 32);

  const out = new Uint8Array(65);
  out[0] = 0x04;
  for (let i = 0; i < 32; i++) out[1 + i] = pubX[i];
  for (let i = 0; i < 32; i++) out[33 + i] = pubY[i];
  return out;
}

export function verify(msgHash: Uint8Array, sig: { r: bigint; s: bigint }, publicKey: Uint8Array): boolean {
  const r = sig.r;
  const s = sig.s;

  if (r < 1n || r >= N || s < 1n || s >= N) return false;

  let pubX: bigint;
  let pubY: bigint;

  if (publicKey[0] === 0x04 && publicKey.length === 65) {
    pubX = bytesRangeToBigInt(publicKey, 1, 33);
    pubY = bytesRangeToBigInt(publicKey, 33, 65);
  } else if ((publicKey[0] === 0x02 || publicKey[0] === 0x03) && publicKey.length === 33) {
    pubX = bytesRangeToBigInt(publicKey, 1, 33);
    const ySquared = mod(modPow(pubX, 3n, P) + 7n, P);
    pubY = modPow(ySquared, (P + 1n) / 4n, P);
    if ((pubY & 1n) !== BigInt(publicKey[0] & 1)) {
      pubY = P - pubY;
    }
  } else {
    return false;
  }

  const z = bytesToBigInt(msgHash);
  const sInv = modInverse(s, N);
  const u1 = mod(z * sInv, N);
  const u2 = mod(r * sInv, N);

  const pubPoint: JacobianPoint = { x: pubX, y: pubY, z: 1n };
  const point = pointAdd(pointMultiply(G, u1), pointMultiply(pubPoint, u2));

  if (isZero(point)) return false;

  const aff = toAffine(point);
  return mod(aff.x, N) === r;
}
