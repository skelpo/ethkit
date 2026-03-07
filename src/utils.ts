// Constants
export const ZeroAddress = '0x0000000000000000000000000000000000000000';
export const ZeroHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
export const MaxUint256 = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn;

/** Convert a number/bigint to a minimal hex quantity (0x1, 0xa, etc.) */
export function toQuantity(value: number | bigint | string): string {
    if (typeof value === 'string') {
        if (value.startsWith('0x')) return value;
        value = BigInt(value);
    }
    const hex = BigInt(value).toString(16);
    return '0x' + hex;
}

/** Check if a value is a hex string, optionally of a specific byte length */
export function isHexString(value: any, length?: number): boolean {
    if (typeof value !== 'string') return false;
    if (!value.match(/^0x[0-9a-fA-F]*$/)) return false;
    if (length !== undefined && value.length !== 2 + length * 2) return false;
    return true;
}

/** Convert bytes or number to hex string */
export function hexlify(value: Uint8Array | number | bigint | string): string {
    if (typeof value === 'string') {
        if (value.startsWith('0x')) return value;
        return '0x' + value;
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
        return '0x' + BigInt(value).toString(16);
    }
    let hex = '0x';
    for (let i = 0; i < value.length; i++) {
        hex += value[i].toString(16).padStart(2, '0');
    }
    return hex;
}

/** Convert any value to BigInt */
export function toBigInt(value: string | number | bigint): bigint {
    return BigInt(value);
}

/** Left-pad a hex value to the specified byte length */
export function zeroPadValue(value: string, length: number): string {
    if (value.startsWith('0x')) value = value.slice(2);
    return '0x' + value.toLowerCase().padStart(length * 2, '0');
}

/** Extract a slice from hex data */
export function dataSlice(data: string, offset: number, endOffset?: number): string {
    if (data.startsWith('0x')) data = data.slice(2);
    const start = offset * 2;
    const end = endOffset !== undefined ? endOffset * 2 : undefined;
    return '0x' + data.slice(start, end);
}

/** Get the byte length of a hex string */
export function dataLength(data: string): number {
    if (data.startsWith('0x')) data = data.slice(2);
    return data.length / 2;
}

/** Concatenate hex strings */
export function concat(items: string[]): string {
    return '0x' + items.map(h => h.startsWith('0x') ? h.slice(2) : h).join('');
}

/** Strip trailing zeros from hex (used in some contexts) */
export function stripZerosLeft(value: string): string {
    if (value.startsWith('0x')) value = value.slice(2);
    const stripped = value.replace(/^0+/, '') || '0';
    return '0x' + stripped;
}
