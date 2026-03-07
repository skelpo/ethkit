import { encode, decode, encodeFunctionData, decodeFunctionResult, parseSignature, functionSelector } from './abi.js';
import type { Provider } from './provider.js';
import type { Wallet } from './wallet.js';
import type { BlockTag } from './types.js';

export interface ContractCall {
    to: string;
    data: string;
}

/** Make a read-only contract call (eth_call) */
export async function contractCall(
    provider: Provider,
    address: string,
    sig: string,
    args: any[] = [],
    blockTag?: BlockTag,
): Promise<any[]> {
    const data = encodeFunctionData(sig, args);
    const result = await provider.call({ to: address, data, blockTag });
    if (!result || result === '0x') return [];
    return decodeFunctionResult(sig, result);
}

/** Make a write contract call (send transaction) */
export async function contractSend(
    wallet: Wallet,
    address: string,
    sig: string,
    args: any[] = [],
    overrides: { value?: bigint; gasLimit?: bigint; maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint; gasPrice?: bigint; nonce?: number } = {},
): Promise<{ hash: string }> {
    const data = encodeFunctionData(sig, args);
    return wallet.sendTransaction({
        to: address,
        data,
        ...overrides,
    });
}

/**
 * Create a contract interface for convenient read calls.
 * Usage:
 *   const erc20 = createContractReader(provider, tokenAddress, [
 *     'balanceOf(address) returns (uint256)',
 *     'symbol() returns (string)',
 *     'decimals() returns (uint8)',
 *   ]);
 *   const [balance] = await erc20.balanceOf(holderAddress);
 *   const [symbol] = await erc20.symbol();
 */
export function createContractReader(
    provider: Provider,
    address: string,
    sigs: string[],
): Record<string, (...args: any[]) => Promise<any[]>> {
    const methods: Record<string, (...args: any[]) => Promise<any[]>> = {};
    for (const sig of sigs) {
        const { name } = parseSignature(sig);
        methods[name] = (...args: any[]) => contractCall(provider, address, sig, args);
    }
    return methods;
}

// --- ABI JSON parsing for Contract() ---

interface AbiEntry {
    type?: string;
    name?: string;
    inputs?: { type: string; name?: string; components?: any[] }[];
    outputs?: { type: string; name?: string; components?: any[] }[];
    stateMutability?: string;
}

/** Convert tuple components to a Solidity tuple type string */
function tupleType(components: any[]): string {
    const inner = components.map(c => {
        if (c.components) return tupleType(c.components);
        return c.type;
    }).join(',');
    return `(${inner})`;
}

/** Resolve a type, handling tuples */
function resolveType(input: { type: string; components?: any[] }): string {
    if (input.type === 'tuple' && input.components) {
        return tupleType(input.components);
    }
    if (input.type === 'tuple[]' && input.components) {
        return tupleType(input.components) + '[]';
    }
    return input.type;
}

/** Build a function signature string from an ABI entry */
function abiEntryToSig(entry: AbiEntry): string {
    const inputs = (entry.inputs || []).map(resolveType).join(',');
    const outputs = (entry.outputs || []).map(resolveType).join(',');
    if (outputs) {
        return `${entry.name}(${inputs}) returns (${outputs})`;
    }
    return `${entry.name}(${inputs})`;
}

/**
 * Drop-in replacement for `new ethers.Contract(address, abi, providerOrSigner)`.
 *
 * Accepts JSON ABI arrays or string ABI arrays.
 * Returns a plain object with methods that call the contract.
 *
 * Read methods return the decoded result directly (single value unwrapped, multiple as array).
 * Write methods return { hash: string }.
 *
 * Usage:
 *   const contract = Contract(address, abi, provider);
 *   const balance = await contract.balanceOf(holderAddress);  // returns bigint
 *   const [reserve0, reserve1] = await contract.getReserves(); // returns array
 */
export function Contract(
    address: string,
    abi: (string | AbiEntry)[],
    runner: Provider | Wallet,
): any {
    const provider: Provider = 'send' in runner && 'call' in runner && !('signTransaction' in runner)
        ? runner as Provider
        : (runner as Wallet).provider!;
    const wallet: Wallet | null = 'signTransaction' in runner ? runner as Wallet : null;

    const methods: Record<string, any> = {};
    // Store the interface-like functionality
    const sigsByName: Record<string, string> = {};
    const selectorsByName: Record<string, string> = {};

    for (const entry of abi) {
        let sig: string;
        let name: string;
        let isView: boolean;

        if (typeof entry === 'string') {
            // String ABI like "function balanceOf(address) view returns (uint256)"
            const parsed = parseSignature(entry);
            name = parsed.name;
            sig = entry;
            isView = entry.includes('view') || entry.includes('pure');
        } else {
            if (entry.type !== 'function' || !entry.name) continue;
            name = entry.name;
            sig = abiEntryToSig(entry);
            isView = entry.stateMutability === 'view' || entry.stateMutability === 'pure';
        }

        sigsByName[name] = sig;
        selectorsByName[name] = functionSelector(sig);

        if (isView) {
            methods[name] = async (...args: any[]) => {
                const result = await contractCall(provider, address, sig, args);
                // ethers compat: unwrap single return value
                return result.length === 1 ? result[0] : result;
            };
        } else {
            methods[name] = async (...args: any[]) => {
                // Last arg might be overrides object
                let callArgs = args;
                let overrides: any = {};
                if (args.length > 0 && typeof args[args.length - 1] === 'object' && args[args.length - 1] !== null) {
                    const lastArg = args[args.length - 1];
                    if ('value' in lastArg || 'gasLimit' in lastArg || 'maxFeePerGas' in lastArg || 'gasPrice' in lastArg || 'nonce' in lastArg) {
                        overrides = lastArg;
                        callArgs = args.slice(0, -1);
                    }
                }
                if (wallet) {
                    return contractSend(wallet, address, sig, callArgs, overrides);
                }
                // Read-only provider but non-view function — do eth_call (staticCall)
                const result = await contractCall(provider, address, sig, callArgs);
                return result.length === 1 ? result[0] : result;
            };
            // Also provide a staticCall version for simulation
            methods[name].staticCall = async (...args: any[]) => {
                const result = await contractCall(provider, address, sig, args);
                return result.length === 1 ? result[0] : result;
            };
        }
    }

    // ethers compat: contract.target = address
    methods.target = address;
    methods.runner = runner;
    // ethers compat: contract.getAddress()
    methods.getAddress = async () => address;

    // interface property for encoding/decoding
    methods.interface = {
        encodeFunctionData: (nameOrSig: string, args: any[] = []) => {
            const sig = sigsByName[nameOrSig] || nameOrSig;
            return encodeFunctionData(sig, args);
        },
        decodeFunctionResult: (nameOrSig: string, data: string) => {
            const sig = sigsByName[nameOrSig] || nameOrSig;
            return decodeFunctionResult(sig, data);
        },
        parseLog: (log: { topics: string[]; data: string }) => {
            // Minimal implementation — returns null for now
            return null;
        },
        fragments: Object.keys(sigsByName).map(name => ({ name, type: 'function' })),
    };

    // ethers compat: contract.connect(newRunner)
    methods.connect = (newRunner: Provider | Wallet) => {
        return Contract(address, abi, newRunner);
    };

    return methods;
}
