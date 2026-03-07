/** RLP (Recursive Length Prefix) encoding for Ethereum transaction serialization */

export function rlpEncode(input: RlpInput): Uint8Array {
    if (input instanceof Uint8Array) {
        if (input.length === 1 && input[0] < 0x80) {
            return input;
        }
        return concatBytes(encodeLength(input.length, 0x80), input);
    }

    if (Array.isArray(input)) {
        let encoded = new Uint8Array(0);
        for (const item of input) {
            encoded = concatBytes(encoded, rlpEncode(item));
        }
        return concatBytes(encodeLength(encoded.length, 0xc0), encoded);
    }

    throw new Error('Invalid RLP input');
}

export type RlpInput = Uint8Array | RlpInput[];

function encodeLength(len: number, offset: number): Uint8Array {
    if (len < 56) {
        return new Uint8Array([offset + len]);
    }
    const lenBytes = numberToBytes(len);
    return concatBytes(new Uint8Array([offset + 55 + lenBytes.length]), lenBytes);
}

function numberToBytes(n: number): Uint8Array {
    if (n === 0) return new Uint8Array(0);
    const hex = n.toString(16);
    const padded = hex.length % 2 === 0 ? hex : '0' + hex;
    const bytes = new Uint8Array(padded.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
    const result = new Uint8Array(a.length + b.length);
    result.set(a, 0);
    result.set(b, a.length);
    return result;
}

/** Convert bigint to minimal-length bytes (no leading zeros, except for 0 itself) */
export function bigintToBytes(value: bigint): Uint8Array {
    if (value === 0n) return new Uint8Array(0);
    let hex = value.toString(16);
    if (hex.length % 2 !== 0) hex = '0' + hex;
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

/** Convert number to minimal-length bytes */
export function numberToMinBytes(value: number): Uint8Array {
    return bigintToBytes(BigInt(value));
}
