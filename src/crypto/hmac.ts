import { sha256 } from './sha256.js';

const BLOCK_SIZE = 64;

export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  let keyBytes: Uint8Array;
  if (key.length > BLOCK_SIZE) {
    keyBytes = sha256(key);
  } else {
    keyBytes = key;
  }

  const ipad = new Uint8Array(BLOCK_SIZE);
  const opad = new Uint8Array(BLOCK_SIZE);
  for (let i = 0; i < BLOCK_SIZE; i++) {
    const kb = i < keyBytes.length ? keyBytes[i] : 0;
    ipad[i] = kb ^ 0x36;
    opad[i] = kb ^ 0x5c;
  }

  const inner = new Uint8Array(BLOCK_SIZE + data.length);
  for (let i = 0; i < BLOCK_SIZE; i++) {
    inner[i] = ipad[i];
  }
  for (let i = 0; i < data.length; i++) {
    inner[BLOCK_SIZE + i] = data[i];
  }

  const innerHash = sha256(inner);

  const outer = new Uint8Array(BLOCK_SIZE + 32);
  for (let i = 0; i < BLOCK_SIZE; i++) {
    outer[i] = opad[i];
  }
  for (let i = 0; i < 32; i++) {
    outer[BLOCK_SIZE + i] = innerHash[i];
  }

  return sha256(outer);
}
