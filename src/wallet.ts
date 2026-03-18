import { sign as secp256k1Sign, getPublicKey as secp256k1GetPublicKey } from './crypto/secp256k1.js';
import { keccak256, hexToBytes, bytesToHex } from './hash.js';
import { computeAddress } from './address.js';
import { serializeEip1559, serializeSignedEip1559, serializeLegacy, serializeSignedLegacy } from './transaction.js';
import type { Provider } from './provider.js';
import type { TransactionRequest, TransactionReceipt } from './types.js';

export interface SendTransactionResult {
    hash: string;
    wait(confirms?: number): Promise<TransactionReceipt | null>;
}

export interface Wallet {
    address: string;
    privateKey: string;
    provider: Provider | null;
    signTransaction(tx: TransactionRequest): Promise<string>;
    sendTransaction(tx: TransactionRequest): Promise<SendTransactionResult>;
    signMessage(message: string | Uint8Array): Promise<string>;
    populateTransaction(tx: TransactionRequest): Promise<TransactionRequest>;
    connect(provider: Provider): Wallet;
    getAddress(): string;
    getNonce(blockTag?: string): Promise<number>;
}

export function createWallet(privateKey: string, provider?: Provider): Wallet {
    if (privateKey.startsWith('0x')) privateKey = privateKey.slice(2);
    const keyBytes = hexToBytes(privateKey);
    const publicKey = secp256k1GetPublicKey(keyBytes, false); // uncompressed
    const address = computeAddress(publicKey);
    let currentProvider = provider || null;

    function sign(hash: string): { r: string; s: string; v: number } {
        const hashBytes = hexToBytes(hash);
        const sig = secp256k1Sign(hashBytes, keyBytes);
        return {
            r: '0x' + sig.r.toString(16).padStart(64, '0'),
            s: '0x' + sig.s.toString(16).padStart(64, '0'),
            v: sig.recovery,
        };
    }

    const wallet: Wallet = {
        address,
        privateKey: '0x' + privateKey,
        provider: currentProvider,

        async signTransaction(tx: TransactionRequest): Promise<string> {
            console.log('[signTx] entered, maxFeePerGas:', tx.maxFeePerGas);
            const type = tx.type ?? (tx.maxFeePerGas !== undefined ? 2 : 0);
            console.log('[signTx] type:', type);

            if (type === 2) {
                console.log('[signTx] EIP-1559 path');
                const { signingHash } = serializeEip1559(tx);
                console.log('[signTx] signingHash:', signingHash);
                const sig = sign(signingHash);
                console.log('[signTx] sig.r:', sig.r?.substring(0, 10));
                const result = serializeSignedEip1559(tx, sig);
                console.log('[signTx] result len:', result?.length);
                return result;
            } else {
                const { signingHash } = serializeLegacy(tx);
                const sig = sign(signingHash);
                // EIP-155: v = recovery + chainId * 2 + 35
                const chainId = tx.chainId || 1;
                sig.v = sig.v + chainId * 2 + 35;
                return serializeSignedLegacy(tx, sig);
            }
        },

        async sendTransaction(tx: TransactionRequest): Promise<SendTransactionResult> {
            if (!currentProvider) throw new Error('No provider connected');
            const p = currentProvider;
            // Auto-fill nonce if missing
            if (tx.nonce === undefined) {
                tx.nonce = await p.getTransactionCount(address, 'latest');
            }
            // Auto-fill chainId if missing
            if (tx.chainId === undefined) {
                tx.chainId = p.chainId;
            }
            // Auto-estimate gasLimit if missing
            if (tx.gasLimit === undefined) {
                const estimate = await p.estimateGas({ to: tx.to, from: address, data: tx.data, value: tx.value });
                tx.gasLimit = estimate * 12n / 10n; // 20% buffer
            }
            // Auto-fill gas price if missing
            if (tx.maxFeePerGas === undefined && tx.gasPrice === undefined) {
                const feeData = await p.getFeeData();
                if (feeData.maxFeePerGas !== null) {
                    tx.maxFeePerGas = feeData.maxFeePerGas;
                    tx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? 1500000000n;
                } else if (feeData.gasPrice !== null) {
                    tx.gasPrice = feeData.gasPrice;
                }
            }
            // Inline signing instead of wallet.signTransaction(tx) — Perry workaround:
            // closure-captured `wallet` object loses its type through cross-module dispatch,
            // so wallet.signTransaction is undefined. Use the directly-captured `sign` function.
            const txType = tx.type ?? (tx.maxFeePerGas !== undefined ? 2 : 0);
            let signedTx: string;
            if (txType === 2) {
                const { signingHash } = serializeEip1559(tx);
                const sig = sign(signingHash);
                signedTx = serializeSignedEip1559(tx, sig);
            } else {
                const { signingHash } = serializeLegacy(tx);
                const sig = sign(signingHash);
                const chainId = tx.chainId || 1;
                sig.v = sig.v + chainId * 2 + 35;
                signedTx = serializeSignedLegacy(tx, sig);
            }
            const hash = await p.sendRawTransaction(signedTx);
            return {
                hash,
                async wait(_confirms?: number): Promise<TransactionReceipt | null> {
                    // Poll for receipt
                    for (let i = 0; i < 120; i++) {
                        const receipt = await p.getTransactionReceipt(hash);
                        if (receipt) return receipt;
                        await new Promise(r => setTimeout(r, 1000));
                    }
                    return null;
                },
            };
        },

        async signMessage(message: string | Uint8Array): Promise<string> {
            let msgBytes: Uint8Array;
            if (typeof message === 'string') {
                msgBytes = new TextEncoder().encode(message);
            } else {
                msgBytes = message;
            }
            // Ethereum signed message prefix
            const prefix = new TextEncoder().encode('\x19Ethereum Signed Message:\n' + msgBytes.length);
            const combined = new Uint8Array(prefix.length + msgBytes.length);
            combined.set(prefix, 0);
            combined.set(msgBytes, prefix.length);
            const hash = keccak256(combined);
            const sig = sign(hash);
            // Pack into 65-byte signature: r (32) + s (32) + v (1)
            const rBytes = hexToBytes(sig.r);
            const sBytes = hexToBytes(sig.s);
            const packed = new Uint8Array(65);
            packed.set(rBytes, 0);
            packed.set(sBytes, 32);
            packed[64] = sig.v + 27;
            return '0x' + bytesToHex(packed);
        },

        connect(newProvider: Provider): Wallet {
            return createWallet('0x' + privateKey, newProvider);
        },

        getAddress(): string {
            return address;
        },

        async populateTransaction(tx: TransactionRequest): Promise<TransactionRequest> {
            const populated = { ...tx };
            if (populated.from === undefined) populated.from = address;
            if (populated.chainId === undefined && currentProvider) {
                populated.chainId = currentProvider.chainId;
            }
            if (populated.nonce === undefined && currentProvider) {
                populated.nonce = await currentProvider.getTransactionCount(address, 'latest');
            }
            if (populated.type === undefined) {
                populated.type = populated.maxFeePerGas !== undefined ? 2 : 0;
            }
            if (populated.gasLimit === undefined && currentProvider) {
                const estimate = await currentProvider.estimateGas({ to: populated.to, from: address, data: populated.data, value: populated.value });
                populated.gasLimit = estimate * 12n / 10n;
            }
            return populated;
        },

        async getNonce(blockTag: string = 'latest'): Promise<number> {
            if (!currentProvider) throw new Error('No provider connected');
            return currentProvider.getTransactionCount(address, blockTag as any);
        },
    };

    return wallet;
}

/** Generate a new random wallet */
export function createRandomWallet(provider?: Provider): Wallet {
    const key = new Uint8Array(32);
    globalThis.crypto.getRandomValues(key);
    return createWallet('0x' + bytesToHex(key), provider);
}
