import type { Provider } from './provider.js';
import type { BlockTag, Block, FeeData, Filter, Log, TransactionReceipt, TransactionResponse } from './types.js';
import { createProvider } from './provider.js';
import { Network } from './json-rpc-provider.js';

type EventListener = (...args: any[]) => void;

/**
 * WebSocket JSON-RPC provider.
 * Uses the global WebSocket if available (browsers, Node 22+), otherwise requires 'ws' to be installed.
 */
export class WebSocketProvider implements Provider {
    readonly url: string;
    readonly chainId: number;
    private _ws: any;
    private _httpProvider: Provider;
    private _network: Network | null;
    private _rpcId: number = 1;
    private _pending: Map<number, { resolve: (v: any) => void; reject: (e: any) => void }> = new Map();
    private _subscriptions: Map<string, EventListener[]> = new Map();
    private _listeners: Map<string, EventListener[]> = new Map();
    private _ready: Promise<void>;
    private _destroyed: boolean = false;

    constructor(url: string, network?: number | Network, _options?: any) {
        this.url = url;
        if (network instanceof Network) {
            this.chainId = network.chainId;
            this._network = network;
        } else if (typeof network === 'number') {
            this.chainId = network;
            this._network = Network.from(network);
        } else {
            this.chainId = 1;
            this._network = null;
        }
        // HTTP fallback for methods not needing WS
        const httpUrl = url.replace(/^ws(s)?:\/\//, 'http$1://');
        this._httpProvider = createProvider(httpUrl, this.chainId);

        this._ready = this._connect();
    }

    private async _connect(): Promise<void> {
        let WsClass: any;
        if (typeof globalThis.WebSocket !== 'undefined') {
            WsClass = globalThis.WebSocket;
        } else {
            // Node.js — require 'ws' package
            try {
                const wsModule = await import('ws');
                WsClass = wsModule.default || wsModule;
            } catch {
                throw new Error('WebSocket not available. Install the "ws" package: npm install ws');
            }
        }

        return new Promise<void>((resolve, reject) => {
            this._ws = new WsClass(this.url);

            this._ws.onopen = () => {
                resolve();
            };

            this._ws.onmessage = (event: any) => {
                const data = typeof event === 'string' ? event : (event.data || event);
                let msg: any;
                try {
                    msg = JSON.parse(typeof data === 'string' ? data : data.toString());
                } catch {
                    return;
                }

                // Subscription notification
                if (msg.method === 'eth_subscription' && msg.params) {
                    const subId = msg.params.subscription;
                    const listeners = this._subscriptions.get(subId);
                    if (listeners) {
                        for (const listener of listeners) {
                            try { listener(msg.params.result); } catch {}
                        }
                    }
                    return;
                }

                // RPC response
                if (msg.id !== undefined) {
                    const pending = this._pending.get(msg.id);
                    if (pending) {
                        this._pending.delete(msg.id);
                        if (msg.error) {
                            pending.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
                        } else {
                            pending.resolve(msg.result);
                        }
                    }
                }
            };

            this._ws.onerror = (err: any) => {
                const errorListeners = this._listeners.get('error');
                if (errorListeners) {
                    for (const listener of errorListeners) {
                        try { listener(err); } catch {}
                    }
                }
                reject(err);
            };

            this._ws.onclose = () => {
                this._destroyed = true;
            };
        });
    }

    private async _wsSend(method: string, params: any[]): Promise<any> {
        await this._ready;
        const id = this._rpcId++;
        return new Promise((resolve, reject) => {
            this._pending.set(id, { resolve, reject });
            const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });
            try {
                this._ws.send(msg);
            } catch (err) {
                this._pending.delete(id);
                reject(err);
            }
        });
    }

    async send(method: string, params: any[]): Promise<any> {
        return this._wsSend(method, params);
    }

    /**
     * Subscribe to an event via eth_subscribe.
     * Returns the subscription ID.
     */
    async subscribe(eventType: string, params?: any[]): Promise<string> {
        const subParams = params ? [eventType, ...params] : [eventType];
        const subId = await this._wsSend('eth_subscribe', subParams);
        return subId;
    }

    on(event: string, listener: EventListener): void {
        // For 'message', 'error', 'network' etc. — store locally
        if (!this._listeners.has(event)) {
            this._listeners.set(event, []);
        }
        this._listeners.get(event)!.push(listener);
    }

    /**
     * Listen to a specific subscription ID (from subscribe()).
     */
    onSubscription(subscriptionId: string, listener: EventListener): void {
        if (!this._subscriptions.has(subscriptionId)) {
            this._subscriptions.set(subscriptionId, []);
        }
        this._subscriptions.get(subscriptionId)!.push(listener);
    }

    off(event: string, listener: EventListener): void {
        const listeners = this._listeners.get(event);
        if (listeners) {
            const idx = listeners.indexOf(listener);
            if (idx >= 0) listeners.splice(idx, 1);
        }
    }

    /** Promise that resolves when the WebSocket connection is open */
    get ready(): Promise<void> {
        return this._ready;
    }

    removeAllListeners(event?: string): void {
        if (event) {
            this._listeners.delete(event);
        } else {
            this._listeners.clear();
            this._subscriptions.clear();
        }
    }

    async destroy(): Promise<void> {
        this._destroyed = true;
        this._pending.clear();
        this._subscriptions.clear();
        this._listeners.clear();
        if (this._ws) {
            try { this._ws.close(); } catch {}
        }
    }

    get websocket(): any {
        return this._ws;
    }

    get _websocket(): any {
        return this._ws;
    }

    // Provider interface methods — delegate to WS send or HTTP fallback

    async call(tx: { to: string; data: string; from?: string; value?: bigint; gasLimit?: bigint; gasPrice?: bigint; blockTag?: BlockTag }): Promise<string> {
        return this._httpProvider.call(tx);
    }

    async getBlockNumber(): Promise<number> {
        const result = await this._wsSend('eth_blockNumber', []);
        return Number(result);
    }

    async getBlock(blockTag: BlockTag, prefetchTxs?: boolean): Promise<Block | null> {
        return this._httpProvider.getBlock(blockTag, prefetchTxs);
    }

    async getGasPrice(): Promise<bigint> {
        const result = await this._wsSend('eth_gasPrice', []);
        return BigInt(result);
    }

    async getFeeData(): Promise<FeeData> {
        return this._httpProvider.getFeeData();
    }

    async getBalance(address: string, blockTag?: BlockTag): Promise<bigint> {
        return this._httpProvider.getBalance(address, blockTag);
    }

    async getTransactionCount(address: string, blockTag?: BlockTag): Promise<number> {
        return this._httpProvider.getTransactionCount(address, blockTag);
    }

    async getCode(address: string, blockTag?: BlockTag): Promise<string> {
        return this._httpProvider.getCode(address, blockTag);
    }

    async getStorageAt(address: string, slot: string, blockTag?: BlockTag): Promise<string> {
        return this._httpProvider.getStorageAt(address, slot, blockTag);
    }

    async estimateGas(tx: { to?: string; from?: string; data?: string; value?: bigint }): Promise<bigint> {
        return this._httpProvider.estimateGas(tx);
    }

    async getLogs(filter: Filter): Promise<Log[]> {
        return this._httpProvider.getLogs(filter);
    }

    async getTransaction(hash: string): Promise<TransactionResponse | null> {
        return this._httpProvider.getTransaction(hash);
    }

    async getTransactionReceipt(hash: string): Promise<TransactionReceipt | null> {
        return this._httpProvider.getTransactionReceipt(hash);
    }

    async sendRawTransaction(signedTx: string): Promise<string> {
        return this._wsSend('eth_sendRawTransaction', [signedTx]);
    }

    async broadcastTransaction(signedTx: string): Promise<string> {
        return this._wsSend('eth_sendRawTransaction', [signedTx]);
    }

    getNetwork(): { chainId: bigint; name: string } {
        return { chainId: BigInt(this.chainId), name: `chain-${this.chainId}` };
    }
}
