import { createProvider } from './provider.js';
import type { Provider } from './provider.js';
import type { BlockTag, Block, FeeData, Filter, Log, TransactionReceipt, TransactionResponse } from './types.js';

export class Network {
    readonly chainId: number;
    readonly name: string;

    constructor(name: string, chainId: number) {
        this.name = name;
        this.chainId = chainId;
    }

    static from(chainIdOrNetwork: number | { chainId: number; name?: string }): Network {
        if (typeof chainIdOrNetwork === 'number') {
            return new Network(`chain-${chainIdOrNetwork}`, chainIdOrNetwork);
        }
        return new Network(chainIdOrNetwork.name || `chain-${chainIdOrNetwork.chainId}`, chainIdOrNetwork.chainId);
    }
}

export interface JsonRpcProviderOptions {
    polling?: boolean;
    staticNetwork?: Network;
    [key: string]: any;
}

/**
 * Class-based JSON-RPC provider for compatibility with code that subclasses ethers.JsonRpcProvider.
 * For new code, prefer createProvider() which returns a plain object.
 */
export class JsonRpcProvider implements Provider {
    readonly url: string;
    readonly chainId: number;
    private _provider: Provider;
    private _network: Network | null;

    constructor(url?: string, network?: number | Network, options?: JsonRpcProviderOptions) {
        this.url = url || 'http://localhost:8545';
        if (network instanceof Network) {
            this.chainId = network.chainId;
            this._network = network;
        } else if (typeof network === 'number') {
            this.chainId = network;
            this._network = Network.from(network);
        } else {
            this.chainId = options?.staticNetwork?.chainId ?? 1;
            this._network = options?.staticNetwork ?? null;
        }
        this._provider = createProvider(this.url, this.chainId);
    }

    async _detectNetwork(): Promise<Network> {
        if (this._network) return this._network;
        try {
            const result = await this.send('eth_chainId', []);
            const chainId = Number(result);
            this._network = Network.from(chainId);
            return this._network;
        } catch {
            return Network.from(this.chainId);
        }
    }

    async send(method: string, params: any[]): Promise<any> {
        return this._provider.send(method, params);
    }

    async call(tx: { to: string; data: string; from?: string; value?: bigint; gasLimit?: bigint; gasPrice?: bigint; blockTag?: BlockTag }): Promise<string> {
        return this._provider.call(tx);
    }

    async getBlockNumber(): Promise<number> {
        return this._provider.getBlockNumber();
    }

    async getBlock(blockTag: BlockTag, prefetchTxs?: boolean): Promise<Block | null> {
        return this._provider.getBlock(blockTag, prefetchTxs);
    }

    async getGasPrice(): Promise<bigint> {
        return this._provider.getGasPrice();
    }

    async getFeeData(): Promise<FeeData> {
        return this._provider.getFeeData();
    }

    async getBalance(address: string, blockTag?: BlockTag): Promise<bigint> {
        return this._provider.getBalance(address, blockTag);
    }

    async getTransactionCount(address: string, blockTag?: BlockTag): Promise<number> {
        return this._provider.getTransactionCount(address, blockTag);
    }

    async getCode(address: string, blockTag?: BlockTag): Promise<string> {
        return this._provider.getCode(address, blockTag);
    }

    async getStorageAt(address: string, slot: string, blockTag?: BlockTag): Promise<string> {
        return this._provider.getStorageAt(address, slot, blockTag);
    }

    async estimateGas(tx: { to?: string; from?: string; data?: string; value?: bigint }): Promise<bigint> {
        return this._provider.estimateGas(tx);
    }

    async getLogs(filter: Filter): Promise<Log[]> {
        return this._provider.getLogs(filter);
    }

    async getTransaction(hash: string): Promise<TransactionResponse | null> {
        return this._provider.getTransaction(hash);
    }

    async getTransactionReceipt(hash: string): Promise<TransactionReceipt | null> {
        return this._provider.getTransactionReceipt(hash);
    }

    async sendRawTransaction(signedTx: string): Promise<string> {
        return this._provider.sendRawTransaction(signedTx);
    }

    async broadcastTransaction(signedTx: string): Promise<string> {
        return this._provider.broadcastTransaction(signedTx);
    }

    getNetwork(): { chainId: bigint; name: string } {
        return this._provider.getNetwork();
    }

    on(event: string, listener: (...args: any[]) => void): void {
        this._provider.on(event, listener);
    }

    removeAllListeners(event?: string): void {
        this._provider.removeAllListeners(event);
    }

    off(_event: string, _listener: (...args: any[]) => void): void {
        // No-op for HTTP providers
    }

    async destroy(): Promise<void> {
        // No-op for HTTP providers
    }
}
