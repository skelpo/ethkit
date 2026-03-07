export type BlockTag = 'latest' | 'earliest' | 'pending' | 'safe' | 'finalized' | number | string;

export interface TransactionRequest {
    to?: string;
    from?: string;
    nonce?: number;
    gasLimit?: bigint;
    gasPrice?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
    data?: string;
    value?: bigint;
    chainId?: number;
    type?: number;
    accessList?: AccessListEntry[];
}

export interface AccessListEntry {
    address: string;
    storageKeys: string[];
}

export interface TransactionResponse {
    hash: string;
    blockNumber: number | null;
    blockHash: string | null;
    from: string;
    to: string | null;
    nonce: number;
    gasLimit: bigint;
    gasPrice: bigint;
    maxFeePerGas: bigint | null;
    maxPriorityFeePerGas: bigint | null;
    data: string;
    value: bigint;
    chainId: number | bigint;
    type: number;
    [key: string]: any;
}

export interface TransactionReceipt {
    hash: string;
    blockNumber: number;
    blockHash: string;
    from: string;
    to: string | null;
    contractAddress: string | null;
    gasUsed: bigint;
    effectiveGasPrice?: bigint;
    status: number;
    logs: Log[];
    [key: string]: any;
}

export interface Log {
    address: string;
    topics: string[];
    data: string;
    blockNumber: number;
    blockHash: string;
    transactionHash: string;
    transactionIndex: number;
    logIndex: number;
}

export interface Block {
    number: number;
    hash: string;
    parentHash: string;
    timestamp: number;
    gasLimit: bigint;
    gasUsed: bigint;
    baseFeePerGas: bigint | null;
    transactions?: string[];
    prefetchedTransactions?: TransactionResponse[];
    [key: string]: any;
}

export interface FeeData {
    gasPrice: bigint | null;
    maxFeePerGas: bigint | null;
    maxPriorityFeePerGas: bigint | null;
}

export interface Filter {
    fromBlock?: BlockTag;
    toBlock?: BlockTag;
    address?: string | string[];
    topics?: (string | string[] | null)[];
}
