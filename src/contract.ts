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
    return await wallet.sendTransaction({
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

/** Parse output parameter names from a string ABI signature like "foo() returns (uint256 balance, int24 tick)" */
function parseOutputNames(sig: string): string[] {
    const returnsIdx = sig.indexOf('returns');
    if (returnsIdx === -1) return [];
    const afterReturns = sig.slice(returnsIdx + 7).trim();
    if (!afterReturns.startsWith('(')) return [];
    // Find matching close paren
    let depth = 0;
    let end = 0;
    for (let i = 0; i < afterReturns.length; i++) {
        if (afterReturns[i] === '(') depth++;
        else if (afterReturns[i] === ')') { depth--; if (depth === 0) { end = i; break; } }
    }
    const inner = afterReturns.slice(1, end);
    if (!inner.trim()) return [];
    // Split by commas respecting nested parens
    const params: string[] = [];
    depth = 0;
    let start = 0;
    for (let i = 0; i < inner.length; i++) {
        if (inner[i] === '(') depth++;
        else if (inner[i] === ')') depth--;
        else if (inner[i] === ',' && depth === 0) {
            params.push(inner.slice(start, i).trim());
            start = i + 1;
        }
    }
    params.push(inner.slice(start).trim());
    // Each param is like "uint256 balance" or "int24" — extract the name (second word) if present
    return params.map(p => {
        const parts = p.split(' ');
        return parts.length >= 2 ? parts[parts.length - 1] : '';
    });
}

/** Add named properties to a result array for ethers.js Result compatibility */
function addNamedProps(result: any[], names: string[]): any {
    for (let i = 0; i < names.length && i < result.length; i++) {
        if (names[i]) {
            (result as any)[names[i]] = result[i];
        }
    }
    return result;
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
    const inner = components.map(c => resolveType(c)).join(',');
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
 * Normalize a value for ABI encoding using component names from JSON ABI.
 * Converts objects with named properties into positional arrays matching ABI order.
 */
function normalizeForAbi(input: { type: string; name?: string; components?: any[] }, value: any): any {
    if ((input.type === 'tuple' || input.type === 'tuple[]') && input.components) {
        if (input.type === 'tuple[]') {
            if (!Array.isArray(value)) return value;
            return value.map((v: any) => normalizeForAbi({ ...input, type: 'tuple' }, v));
        }
        // tuple: convert named object to positional array
        if (Array.isArray(value)) {
            return value.map((v: any, i: number) =>
                input.components![i] ? normalizeForAbi(input.components![i], v) : v
            );
        }
        if (typeof value === 'object' && value !== null) {
            return input.components.map((c: any) => normalizeForAbi(c, value[c.name]));
        }
        return value;
    }
    // For arrays of non-tuple types, just pass through
    if (input.type.endsWith('[]') && Array.isArray(value)) {
        return value;
    }
    return value;
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
    const abiEntriesByName: Record<string, AbiEntry> = {};
    // Overload support: name → array of sigs (for functions with multiple overloads)
    const overloadsByName: Record<string, string[]> = {};

    for (const entry of abi) {
        let sig: string;
        let name: string;
        let isView: boolean;
        let outputNames: string[] = [];

        if (typeof entry === 'string') {
            // String ABI like "function balanceOf(address) view returns (uint256)"
            const parsed = parseSignature(entry);
            name = parsed.name;
            sig = entry;
            isView = entry.includes('view') || entry.includes('pure');
            // Extract output names from string sig: "returns (uint256 balance, int24 tick)"
            outputNames = parseOutputNames(entry);
        } else {
            if (entry.type !== 'function' || !entry.name) continue;
            name = entry.name;
            sig = abiEntryToSig(entry);
            isView = entry.stateMutability === 'view' || entry.stateMutability === 'pure';
            outputNames = (entry.outputs || []).map(o => o.name || '');
            abiEntriesByName[name] = entry;
        }

        sigsByName[name] = sig;
        selectorsByName[name] = functionSelector(sig);
        // Also store by canonical key for ethers bracket-access compat
        // e.g. sigsByName["aggregatedSwap(((uint256,address,address,uint256,uint256)[])[])"]
        const parsed = parseSignature(sig);
        const canonicalKey = parsed.name + '(' + parsed.inputs.join(',') + ')';
        sigsByName[canonicalKey] = sig;
        // Track all overloads per name
        if (!overloadsByName[name]) overloadsByName[name] = [];
        overloadsByName[name].push(sig);

        // Capture outputNames in closure for ethers-compat named result properties
        const outNames = outputNames;

        // Create the method function (used for both name and canonical key access)
        let method: any;
        if (isView) {
            method = async (...args: any[]) => {
                const result = await contractCall(provider, address, sig, args);
                // ethers compat: unwrap single return value
                return result.length === 1 ? result[0] : addNamedProps(result, outNames);
            };
        } else {
            method = async (...args: any[]) => {
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
                    return await contractSend(wallet, address, sig, callArgs, overrides);
                }
                // Read-only provider but non-view function — do eth_call (staticCall)
                const result = await contractCall(provider, address, sig, callArgs);
                return result.length === 1 ? result[0] : addNamedProps(result, outNames);
            };
            // Also provide a staticCall version for simulation
            method.staticCall = async (...args: any[]) => {
                const result = await contractCall(provider, address, sig, args);
                return result.length === 1 ? result[0] : addNamedProps(result, outNames);
            };
        }

        methods[name] = method;
        // Also store method by canonical key for ethers bracket access:
        // e.g. swapper["aggregatedSwap(((uint256,address,address,uint256,uint256)[])[])"]()
        methods[canonicalKey] = method;
    }

    // ethers compat: contract.target = address
    methods.target = address;
    methods.runner = runner;
    // ethers compat: contract.getAddress()
    methods.getAddress = async () => address;

    // Resolve a name or signature to the correct function signature,
    // handling overloaded functions by matching argument count
    function resolveSig(nameOrSig: string, argCount?: number): string {
        // Direct match (full sig, canonical key, or unique name)
        const direct = sigsByName[nameOrSig];
        if (direct) {
            // If there are overloads for this name and we have arg count, pick the right one
            const overloads = overloadsByName[nameOrSig];
            if (overloads && overloads.length > 1 && argCount !== undefined) {
                const match = overloads.find(s => parseSignature(s).inputs.length === argCount);
                if (match) return match;
            }
            return direct;
        }
        // Not found — treat as raw signature string
        return nameOrSig;
    }

    // interface property for encoding/decoding
    methods.interface = {
        encodeFunctionData: (nameOrSig: string | { name: string; selector?: string }, args: any[] = []) => {
            const key = typeof nameOrSig === 'string' ? nameOrSig : nameOrSig.name;
            const sig = resolveSig(key, args.length);
            // Normalize args using JSON ABI component names if available
            const abiEntry = abiEntriesByName[key];
            const normalizedArgs = abiEntry?.inputs
                ? args.map((arg, i) => abiEntry.inputs![i] ? normalizeForAbi(abiEntry.inputs![i], arg) : arg)
                : args;
            return encodeFunctionData(sig, normalizedArgs);
        },
        decodeFunctionResult: (nameOrSig: string | { name: string }, data: string) => {
            const key = typeof nameOrSig === 'string' ? nameOrSig : nameOrSig.name;
            const sig = resolveSig(key);
            return decodeFunctionResult(sig, data);
        },
        getFunction: (nameOrSig: string) => {
            // Strip signature to just the name for lookup
            const justName = nameOrSig.includes('(') ? nameOrSig.slice(0, nameOrSig.indexOf('(')) : nameOrSig;
            const sig = sigsByName[justName] || sigsByName[nameOrSig];
            if (!sig) return null;
            return {
                name: justName,
                selector: selectorsByName[justName],
                format: () => sig,
            };
        },
        parseLog: (log: { topics: string[]; data: string }) => {
            // Minimal implementation — returns null for now
            return null;
        },
        fragments: Object.keys(sigsByName).map(name => ({ name, type: 'function' })),
    };

    // ethers compat: contract.getFunction('name') returns the callable method
    methods.getFunction = (nameOrSig: string) => {
        const justName = nameOrSig.includes('(') ? nameOrSig.slice(0, nameOrSig.indexOf('(')) : nameOrSig;
        return methods[justName] || methods[nameOrSig];
    };

    // ethers compat: contract.connect(newRunner)
    methods.connect = (newRunner: Provider | Wallet) => {
        return Contract(address, abi, newRunner);
    };

    return methods;
}
