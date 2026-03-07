import { keccak_256 } from '@noble/hashes/sha3';
import { secp256k1 } from '@noble/curves/secp256k1';

export function keccak256(data: Uint8Array | string): string {
    let bytes: Uint8Array;
    if (typeof data === 'string') {
        if (data.startsWith('0x')) {
            bytes = hexToBytes(data);
        } else {
            bytes = toUtf8Bytes(data);
        }
    } else {
        bytes = data;
    }
    return '0x' + bytesToHex(keccak_256(bytes));
}

/** Compute the full keccak256 hash of a UTF-8 string (e.g. event/function signature) */
export function id(text: string): string {
    return keccak256(toUtf8Bytes(text));
}

export function toUtf8Bytes(str: string): Uint8Array {
    const bytes: number[] = [];
    for (let i = 0; i < str.length; i++) {
        let c = str.charCodeAt(i);
        if (c < 0x80) {
            bytes.push(c);
        } else if (c < 0x800) {
            bytes.push(0xc0 | (c >> 6));
            bytes.push(0x80 | (c & 0x3f));
        } else if (c >= 0xd800 && c < 0xe000) {
            // Surrogate pair
            i++;
            const c2 = str.charCodeAt(i);
            const cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
            bytes.push(0xf0 | (cp >> 18));
            bytes.push(0x80 | ((cp >> 12) & 0x3f));
            bytes.push(0x80 | ((cp >> 6) & 0x3f));
            bytes.push(0x80 | (cp & 0x3f));
        } else {
            bytes.push(0xe0 | (c >> 12));
            bytes.push(0x80 | ((c >> 6) & 0x3f));
            bytes.push(0x80 | (c & 0x3f));
        }
    }
    return new Uint8Array(bytes);
}

export function toUtf8String(bytes: Uint8Array): string {
    let str = '';
    for (let i = 0; i < bytes.length;) {
        const b = bytes[i];
        if (b < 0x80) {
            str += String.fromCharCode(b);
            i++;
        } else if ((b & 0xe0) === 0xc0) {
            str += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
            i += 2;
        } else if ((b & 0xf0) === 0xe0) {
            str += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
            i += 3;
        } else {
            const cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
            str += String.fromCodePoint(cp);
            i += 4;
        }
    }
    return str;
}

export function hexToBytes(hex: string): Uint8Array {
    if (hex.startsWith('0x')) hex = hex.slice(2);
    if (hex.length % 2 !== 0) hex = '0' + hex;
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
}

export function concat(arrays: Uint8Array[]): Uint8Array {
    let totalLength = 0;
    for (const arr of arrays) totalLength += arr.length;
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
}

/** EIP-191 personal message hash: keccak256("\x19Ethereum Signed Message:\n" + len + message) */
export function hashMessage(message: string | Uint8Array): string {
    let msgBytes: Uint8Array;
    if (typeof message === 'string') {
        msgBytes = toUtf8Bytes(message);
    } else {
        msgBytes = message;
    }
    const prefix = toUtf8Bytes('\x19Ethereum Signed Message:\n' + msgBytes.length);
    const combined = new Uint8Array(prefix.length + msgBytes.length);
    combined.set(prefix, 0);
    combined.set(msgBytes, prefix.length);
    return keccak256(combined);
}

/** Recover the address that signed a message hash with the given signature */
export function recoverAddress(digest: string, signature: string): string {
    const sigBytes = hexToBytes(signature);
    const r = sigBytes.slice(0, 32);
    const s = sigBytes.slice(32, 64);
    const v = sigBytes[64];
    const recoveryBit = v >= 27 ? v - 27 : v;
    const sig = new secp256k1.Signature(
        BigInt('0x' + bytesToHex(r)),
        BigInt('0x' + bytesToHex(s)),
    ).addRecoveryBit(recoveryBit);
    const pubKey = sig.recoverPublicKey(hexToBytes(digest));
    const uncompressed = pubKey.toRawBytes(false);
    // Address = last 20 bytes of keccak256(pubkey without 0x04 prefix)
    const hash = keccak_256(uncompressed.slice(1));
    return '0x' + bytesToHex(hash.slice(-20));
}

export function zeroPad(data: Uint8Array, length: number): Uint8Array {
    if (data.length >= length) return data;
    const result = new Uint8Array(length);
    result.set(data, length - data.length);
    return result;
}
