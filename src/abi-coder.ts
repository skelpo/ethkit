import { encode, decode } from './abi.js';

/**
 * Drop-in replacement for ethers.AbiCoder.
 * Usage: AbiCoder.defaultAbiCoder().encode/decode or new AbiCoder().encode/decode
 */
export class AbiCoder {
    private static instance: AbiCoder;

    static defaultAbiCoder(): AbiCoder {
        if (!AbiCoder.instance) AbiCoder.instance = new AbiCoder();
        return AbiCoder.instance;
    }

    encode(types: string[], values: any[]): string {
        return encode(types, values);
    }

    decode(types: string[], data: string): any[] {
        return decode(types, data);
    }
}
