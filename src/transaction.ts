import { keccak256, hexToBytes, bytesToHex } from './hash.js';
import { rlpEncode, bigintToBytes, numberToMinBytes } from './rlp.js';
import type { TransactionRequest, AccessListEntry } from './types.js';

/** Serialize an EIP-1559 (type 2) transaction for signing */
export function serializeEip1559(tx: TransactionRequest): { unsigned: Uint8Array; signingHash: string } {
    const chainId = tx.chainId || 1;
    const fields = [
        bigintToBytes(BigInt(chainId)),
        numberToMinBytes(tx.nonce || 0),
        bigintToBytes(tx.maxPriorityFeePerGas || 0n),
        bigintToBytes(tx.maxFeePerGas || 0n),
        bigintToBytes(tx.gasLimit || 0n),
        tx.to ? hexToBytes(tx.to) : new Uint8Array(0),
        bigintToBytes(tx.value || 0n),
        tx.data ? hexToBytes(tx.data) : new Uint8Array(0),
        encodeAccessList(tx.accessList || []),
    ];

    const encoded = rlpEncode(fields);
    // Type 2 prefix
    const unsigned = new Uint8Array(1 + encoded.length);
    unsigned[0] = 0x02;
    unsigned.set(encoded, 1);

    const signingHash = keccak256(unsigned);
    return { unsigned, signingHash };
}

/** Serialize a signed EIP-1559 transaction (ready to broadcast) */
export function serializeSignedEip1559(
    tx: TransactionRequest,
    signature: { r: string; s: string; v: number }
): string {
    const chainId = tx.chainId || 1;
    const fields = [
        bigintToBytes(BigInt(chainId)),
        numberToMinBytes(tx.nonce || 0),
        bigintToBytes(tx.maxPriorityFeePerGas || 0n),
        bigintToBytes(tx.maxFeePerGas || 0n),
        bigintToBytes(tx.gasLimit || 0n),
        tx.to ? hexToBytes(tx.to) : new Uint8Array(0),
        bigintToBytes(tx.value || 0n),
        tx.data ? hexToBytes(tx.data) : new Uint8Array(0),
        encodeAccessList(tx.accessList || []),
        bigintToBytes(BigInt(signature.v)),
        bigintToBytes(BigInt(signature.r)),
        bigintToBytes(BigInt(signature.s)),
    ];

    const encoded = rlpEncode(fields);
    const signed = new Uint8Array(1 + encoded.length);
    signed[0] = 0x02;
    signed.set(encoded, 1);

    return '0x' + bytesToHex(signed);
}

/** Serialize a legacy (type 0) transaction for signing */
export function serializeLegacy(tx: TransactionRequest): { unsigned: Uint8Array; signingHash: string } {
    const chainId = tx.chainId || 1;
    const fields = [
        numberToMinBytes(tx.nonce || 0),
        bigintToBytes(tx.gasPrice || 0n),
        bigintToBytes(tx.gasLimit || 0n),
        tx.to ? hexToBytes(tx.to) : new Uint8Array(0),
        bigintToBytes(tx.value || 0n),
        tx.data ? hexToBytes(tx.data) : new Uint8Array(0),
        // EIP-155: include chainId, 0, 0 for signing
        bigintToBytes(BigInt(chainId)),
        new Uint8Array(0),
        new Uint8Array(0),
    ];

    const unsigned = rlpEncode(fields);
    const signingHash = keccak256(unsigned);
    return { unsigned, signingHash };
}

/** Serialize a signed legacy transaction */
export function serializeSignedLegacy(
    tx: TransactionRequest,
    signature: { r: string; s: string; v: number }
): string {
    const fields = [
        numberToMinBytes(tx.nonce || 0),
        bigintToBytes(tx.gasPrice || 0n),
        bigintToBytes(tx.gasLimit || 0n),
        tx.to ? hexToBytes(tx.to) : new Uint8Array(0),
        bigintToBytes(tx.value || 0n),
        tx.data ? hexToBytes(tx.data) : new Uint8Array(0),
        bigintToBytes(BigInt(signature.v)),
        bigintToBytes(BigInt(signature.r)),
        bigintToBytes(BigInt(signature.s)),
    ];

    return '0x' + bytesToHex(rlpEncode(fields));
}

/** Compute transaction hash from signed serialized data */
export function transactionHash(serialized: string): string {
    return keccak256(hexToBytes(serialized));
}

function encodeAccessList(list: AccessListEntry[]): any[] {
    return list.map(entry => [
        hexToBytes(entry.address),
        entry.storageKeys.map(k => hexToBytes(k))
    ]);
}
