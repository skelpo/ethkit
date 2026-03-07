import { keccak256, hexToBytes, bytesToHex } from './hash.js';

/** EIP-55 checksum address */
export function getAddress(address: string): string {
    if (!address.startsWith('0x') || address.length !== 42) {
        throw new Error(`Invalid address: ${address}`);
    }
    const lower = address.slice(2).toLowerCase();
    const hash = keccak256(new TextEncoder().encode(lower)).slice(2);
    let checksummed = '0x';
    for (let i = 0; i < 40; i++) {
        const c = lower[i];
        checksummed += parseInt(hash[i], 16) >= 8 ? c.toUpperCase() : c;
    }
    return checksummed;
}

export function isAddress(value: string): boolean {
    if (typeof value !== 'string') return false;
    if (!value.match(/^0x[0-9a-fA-F]{40}$/)) return false;
    return true;
}

/** Derive address from an uncompressed public key (65 bytes with 0x04 prefix, or 64 bytes without) */
export function computeAddress(publicKey: Uint8Array): string {
    let key = publicKey;
    if (key.length === 65 && key[0] === 0x04) {
        key = key.slice(1);
    }
    if (key.length !== 64) {
        throw new Error(`Invalid public key length: ${key.length}`);
    }
    const hash = keccak256(key);
    return getAddress('0x' + hash.slice(26));
}
