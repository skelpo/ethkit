import type { BlockTag, Block, FeeData, Filter, Log, TransactionReceipt, TransactionResponse } from './types.js';

let globalRpcId = 1;

export interface Provider {
    url: string;
    chainId: number;
    /** eth_call — accepts {to, data, from?, value?, blockTag?} like ethers */
    call(tx: { to: string; data: string; from?: string; value?: bigint; gasLimit?: bigint; gasPrice?: bigint; blockTag?: BlockTag }): Promise<string>;
    /** Raw JSON-RPC — ethers.js compat (provider.send) */
    send(method: string, params: any[]): Promise<any>;
    getBlockNumber(): Promise<number>;
    getBlock(blockTag: BlockTag, prefetchTxs?: boolean): Promise<Block | null>;
    getGasPrice(): Promise<bigint>;
    getFeeData(): Promise<FeeData>;
    getBalance(address: string, blockTag?: BlockTag): Promise<bigint>;
    getTransactionCount(address: string, blockTag?: BlockTag): Promise<number>;
    getCode(address: string, blockTag?: BlockTag): Promise<string>;
    getStorageAt(address: string, slot: string, blockTag?: BlockTag): Promise<string>;
    estimateGas(tx: { to?: string; from?: string; data?: string; value?: bigint }): Promise<bigint>;
    getLogs(filter: Filter): Promise<Log[]>;
    getTransaction(hash: string): Promise<TransactionResponse | null>;
    getTransactionReceipt(hash: string): Promise<TransactionReceipt | null>;
    sendRawTransaction(signedTx: string): Promise<string>;
    broadcastTransaction(signedTx: string): Promise<string>;
    getNetwork(): { chainId: bigint; name: string };
    /** Event subscription (no-op for HTTP providers, used by WebSocket providers) */
    on(event: string, listener: (...args: any[]) => void): void;
    off(event: string, listener: (...args: any[]) => void): void;
    removeAllListeners(event?: string): void;
}

function blockTagToHex(tag: BlockTag): string {
    if (typeof tag === 'number') {
        // Build hex string without toString(16) in a function — Perry workaround
        const HEX_CHARS = '0123456789abcdef';
        let n = tag;
        if (n === 0) return '0x0';
        let hex = '';
        while (n > 0) {
            hex = HEX_CHARS[n & 0xf] + hex;
            n = Math.floor(n / 16);
        }
        return '0x' + hex;
    }
    return String(tag);
}

export function createProvider(url: string, chainId: number = 1): Provider {
    async function rpc(method: string, params: any[]): Promise<any> {
        const id = globalRpcId++;
        const body = JSON.stringify({ jsonrpc: '2.0', method, params, id });
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        });
        const text = await resp.text();
        const json = JSON.parse(text);
        if (json.error) {
            throw new Error(`RPC error (${method}): ${json.error.message || JSON.stringify(json.error)}`);
        }
        return json.result;
    }

    return {
        url,
        chainId,

        async call(tx: { to: string; data: string; from?: string; value?: bigint; gasLimit?: bigint; gasPrice?: bigint; blockTag?: BlockTag }): Promise<string> {
            const params: any = { to: tx.to, data: tx.data };
            if (tx.from) params.from = tx.from;
            if (tx.value) params.value = '0x' + tx.value.toString(16);
            if (tx.gasLimit) params.gas = '0x' + tx.gasLimit.toString(16);
            if (tx.gasPrice) params.gasPrice = '0x' + tx.gasPrice.toString(16);
            const block = tx.blockTag !== undefined ? blockTagToHex(tx.blockTag) : 'latest';
            return rpc('eth_call', [params, block]);
        },

        send: rpc,

        async getBlockNumber(): Promise<number> {
            const result = await rpc('eth_blockNumber', []);
            return Number(result);
        },

        async getBlock(blockTag: BlockTag, prefetchTxs?: boolean): Promise<Block | null> {
            const result = await rpc('eth_getBlockByNumber', [blockTagToHex(blockTag), !!prefetchTxs]);
            if (!result) return null;
            const block: Block = {
                number: Number(result.number),
                hash: result.hash,
                parentHash: result.parentHash,
                timestamp: Number(result.timestamp),
                gasLimit: BigInt(result.gasLimit),
                gasUsed: BigInt(result.gasUsed),
                baseFeePerGas: result.baseFeePerGas ? BigInt(result.baseFeePerGas) : null,
            };
            if (result.transactions) {
                if (prefetchTxs && result.transactions.length > 0 && typeof result.transactions[0] === 'object') {
                    block.prefetchedTransactions = result.transactions;
                    block.transactions = result.transactions.map((t: any) => t.hash);
                } else {
                    block.transactions = result.transactions;
                }
            }
            return block;
        },

        async getGasPrice(): Promise<bigint> {
            const result = await rpc('eth_gasPrice', []);
            return BigInt(result);
        },

        async getFeeData(): Promise<FeeData> {
            const block = await rpc('eth_getBlockByNumber', ['latest', false]);
            const gasPrice = await rpc('eth_gasPrice', []);
            const baseFee = block?.baseFeePerGas ? BigInt(block.baseFeePerGas) : null;
            let maxPriorityFeePerGas: bigint | null = null;
            try {
                const tip = await rpc('eth_maxPriorityFeePerGas', []);
                maxPriorityFeePerGas = BigInt(tip);
            } catch {
                maxPriorityFeePerGas = 1500000000n; // 1.5 gwei fallback
            }
            const maxFeePerGas = baseFee !== null && maxPriorityFeePerGas !== null
                ? baseFee * 2n + maxPriorityFeePerGas
                : null;
            return {
                gasPrice: BigInt(gasPrice),
                maxFeePerGas,
                maxPriorityFeePerGas,
            };
        },

        async getBalance(address: string, blockTag: BlockTag = 'latest'): Promise<bigint> {
            const result = await rpc('eth_getBalance', [address, blockTagToHex(blockTag)]);
            return BigInt(result);
        },

        async getTransactionCount(address: string, blockTag: BlockTag = 'latest'): Promise<number> {
            const result = await rpc('eth_getTransactionCount', [address, blockTagToHex(blockTag)]);
            return Number(result);
        },

        async getCode(address: string, blockTag: BlockTag = 'latest'): Promise<string> {
            return rpc('eth_getCode', [address, blockTagToHex(blockTag)]);
        },

        async estimateGas(tx: { to?: string; from?: string; data?: string; value?: bigint }): Promise<bigint> {
            const params: any = {};
            if (tx.to) params.to = tx.to;
            if (tx.from) params.from = tx.from;
            if (tx.data) params.data = tx.data;
            if (tx.value) params.value = '0x' + tx.value.toString(16);
            const result = await rpc('eth_estimateGas', [params]);
            return BigInt(result);
        },

        async getLogs(filter: Filter): Promise<Log[]> {
            const params: any = {};
            if (filter.fromBlock !== undefined) params.fromBlock = blockTagToHex(filter.fromBlock);
            if (filter.toBlock !== undefined) params.toBlock = blockTagToHex(filter.toBlock);
            if (filter.address) params.address = filter.address;
            if (filter.topics) params.topics = filter.topics;
            const result = await rpc('eth_getLogs', [params]);
            return (result || []).map((log: any) => ({
                address: log.address,
                topics: log.topics,
                data: log.data,
                blockNumber: Number(log.blockNumber),
                blockHash: log.blockHash,
                transactionHash: log.transactionHash,
                transactionIndex: Number(log.transactionIndex),
                logIndex: Number(log.logIndex),
            }));
        },

        async getTransaction(hash: string): Promise<TransactionResponse | null> {
            const result = await rpc('eth_getTransactionByHash', [hash]);
            if (!result) return null;
            return {
                hash: result.hash,
                blockNumber: result.blockNumber ? Number(result.blockNumber) : null,
                blockHash: result.blockHash,
                from: result.from,
                to: result.to,
                nonce: Number(result.nonce),
                gasLimit: BigInt(result.gas),
                gasPrice: BigInt(result.gasPrice || '0x0'),
                maxFeePerGas: result.maxFeePerGas ? BigInt(result.maxFeePerGas) : null,
                maxPriorityFeePerGas: result.maxPriorityFeePerGas ? BigInt(result.maxPriorityFeePerGas) : null,
                data: result.input,
                value: BigInt(result.value),
                chainId: Number(result.chainId || '0x1'),
                type: Number(result.type || '0x0'),
            };
        },

        async getTransactionReceipt(hash: string): Promise<TransactionReceipt | null> {
            const result = await rpc('eth_getTransactionReceipt', [hash]);
            if (!result) return null;
            return {
                hash: result.transactionHash,
                blockNumber: Number(result.blockNumber),
                blockHash: result.blockHash,
                from: result.from,
                to: result.to,
                contractAddress: result.contractAddress,
                gasUsed: BigInt(result.gasUsed),
                effectiveGasPrice: BigInt(result.effectiveGasPrice || '0x0'),
                status: Number(result.status),
                logs: (result.logs || []).map((log: any) => ({
                    address: log.address,
                    topics: log.topics,
                    data: log.data,
                    blockNumber: Number(log.blockNumber),
                    blockHash: log.blockHash,
                    transactionHash: log.transactionHash,
                    transactionIndex: Number(log.transactionIndex),
                    logIndex: Number(log.logIndex),
                })),
            };
        },

        async sendRawTransaction(signedTx: string): Promise<string> {
            return rpc('eth_sendRawTransaction', [signedTx]);
        },

        async broadcastTransaction(signedTx: string): Promise<string> {
            return rpc('eth_sendRawTransaction', [signedTx]);
        },

        async getStorageAt(address: string, slot: string, blockTag: BlockTag = 'latest'): Promise<string> {
            return rpc('eth_getStorageAt', [address, slot, blockTagToHex(blockTag)]);
        },

        getNetwork(): { chainId: bigint; name: string } {
            return { chainId: BigInt(chainId), name: `chain-${chainId}` };
        },

        on(_event: string, _listener: (...args: any[]) => void): void {
            // No-op for HTTP providers
        },

        off(_event: string, _listener: (...args: any[]) => void): void {
            // No-op for HTTP providers
        },

        removeAllListeners(_event?: string): void {
            // No-op for HTTP providers — override in WebSocket providers
        },
    };
}
