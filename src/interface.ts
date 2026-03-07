import { encode, decode, encodeFunctionData, decodeFunctionResult, parseSignature, functionSelector, eventTopic } from './abi.js';
import { keccak256, toUtf8Bytes } from './hash.js';

interface AbiEntry {
    type?: string;
    name?: string;
    inputs?: { type: string; name?: string; indexed?: boolean; components?: any[] }[];
    outputs?: { type: string; name?: string; components?: any[] }[];
    stateMutability?: string;
}

/** Convert tuple components to a Solidity tuple type string */
function tupleType(components: any[]): string {
    const inner = components.map((c: any) => {
        if (c.components) return tupleType(c.components);
        return c.type;
    }).join(',');
    return `(${inner})`;
}

function resolveType(input: { type: string; components?: any[] }): string {
    if (input.type === 'tuple' && input.components) {
        return tupleType(input.components);
    }
    if (input.type === 'tuple[]' && input.components) {
        return tupleType(input.components) + '[]';
    }
    return input.type;
}

interface ParsedFunction {
    name: string;
    sig: string;
    selector: string;
    inputTypes: string[];
    inputNames: string[];
    outputTypes: string[];
    stateMutability: string;
}

interface ParsedEvent {
    name: string;
    topicHash: string;
    inputs: { type: string; indexed: boolean; name: string }[];
}

interface ParsedError {
    name: string;
    selector: string;
    inputTypes: string[];
}

/**
 * Drop-in replacement for ethers.Interface.
 *
 * Accepts JSON ABI arrays or string ABI arrays.
 */
export class Interface {
    private functions: Map<string, ParsedFunction> = new Map();
    private functionsBySelector: Map<string, ParsedFunction> = new Map();
    private events: Map<string, ParsedEvent> = new Map();
    private eventsByTopic: Map<string, ParsedEvent> = new Map();
    private errors: Map<string, ParsedError> = new Map();
    private errorsBySelector: Map<string, ParsedError> = new Map();
    readonly fragments: any[] = [];

    constructor(abi: (string | AbiEntry)[]) {
        for (const entry of abi) {
            if (typeof entry === 'string') {
                this.parseStringEntry(entry);
            } else {
                this.parseJsonEntry(entry);
            }
        }
    }

    private parseStringEntry(entry: string) {
        const trimmed = entry.trim();
        if (trimmed.startsWith('function ') || (!trimmed.startsWith('event ') && !trimmed.startsWith('error ') && trimmed.includes('('))) {
            const parsed = parseSignature(trimmed);
            const sig = `${parsed.name}(${parsed.inputs.join(',')})`;
            const selector = keccak256(toUtf8Bytes(sig)).slice(0, 10);
            const fn: ParsedFunction = {
                name: parsed.name,
                sig: trimmed,
                selector,
                inputTypes: parsed.inputs,
                inputNames: parsed.inputs.map((_: string, i: number) => `arg${i}`),
                outputTypes: parsed.outputs,
                stateMutability: trimmed.includes('view') ? 'view' : trimmed.includes('pure') ? 'pure' : 'nonpayable',
            };
            this.functions.set(parsed.name, fn);
            this.functionsBySelector.set(selector, fn);
            this.fragments.push({ name: parsed.name, type: 'function' });
        } else if (trimmed.startsWith('event ')) {
            const match = trimmed.match(/^event\s+(\w+)\(([^)]*)\)/);
            if (match) {
                const name = match[1];
                const params = match[2] ? match[2].split(',').map(p => {
                    const parts = p.trim().split(/\s+/);
                    const indexed = parts.includes('indexed');
                    return { type: parts[0], indexed, name: parts[parts.length - 1] };
                }) : [];
                const canonical = name + '(' + params.map(p => p.type).join(',') + ')';
                const topicHash = keccak256(toUtf8Bytes(canonical));
                const evt: ParsedEvent = { name, topicHash, inputs: params };
                this.events.set(name, evt);
                this.eventsByTopic.set(topicHash, evt);
                this.fragments.push({ name, type: 'event' });
            }
        } else if (trimmed.startsWith('error ')) {
            const match = trimmed.match(/^error\s+(\w+)\(([^)]*)\)/);
            if (match) {
                const name = match[1];
                const inputTypes = match[2] ? match[2].split(',').map(t => t.trim().split(/\s+/)[0]) : [];
                const canonical = name + '(' + inputTypes.join(',') + ')';
                const selector = keccak256(toUtf8Bytes(canonical)).slice(0, 10);
                const err: ParsedError = { name, selector, inputTypes };
                this.errors.set(name, err);
                this.errorsBySelector.set(selector, err);
                this.fragments.push({ name, type: 'error' });
            }
        }
    }

    private parseJsonEntry(entry: AbiEntry) {
        if (entry.type === 'function' && entry.name) {
            const inputTypes = (entry.inputs || []).map(resolveType);
            const outputTypes = (entry.outputs || []).map(resolveType);
            const sig = `${entry.name}(${inputTypes.join(',')}) returns (${outputTypes.join(',')})`;
            const canonical = entry.name + '(' + inputTypes.join(',') + ')';
            const selector = keccak256(toUtf8Bytes(canonical)).slice(0, 10);
            const fn: ParsedFunction = {
                name: entry.name,
                sig,
                selector,
                inputTypes,
                inputNames: (entry.inputs || []).map((inp, i) => inp.name || `arg${i}`),
                outputTypes,
                stateMutability: entry.stateMutability || 'nonpayable',
            };
            this.functions.set(entry.name, fn);
            this.functionsBySelector.set(selector, fn);
            this.fragments.push({ name: entry.name, type: 'function', inputs: entry.inputs, outputs: entry.outputs });
        } else if (entry.type === 'event' && entry.name) {
            const inputs = (entry.inputs || []).map(i => ({
                type: resolveType(i),
                indexed: i.indexed || false,
                name: i.name || '',
            }));
            const canonical = entry.name + '(' + inputs.map(i => i.type).join(',') + ')';
            const topicHash = keccak256(toUtf8Bytes(canonical));
            const evt: ParsedEvent = { name: entry.name, topicHash, inputs };
            this.events.set(entry.name, evt);
            this.eventsByTopic.set(topicHash, evt);
            this.fragments.push({ name: entry.name, type: 'event', inputs: entry.inputs });
        } else if (entry.type === 'error' && entry.name) {
            const inputTypes = (entry.inputs || []).map(resolveType);
            const canonical = entry.name + '(' + inputTypes.join(',') + ')';
            const selector = keccak256(toUtf8Bytes(canonical)).slice(0, 10);
            const err: ParsedError = { name: entry.name, selector, inputTypes };
            this.errors.set(entry.name, err);
            this.errorsBySelector.set(selector, err);
            this.fragments.push({ name: entry.name, type: 'error', inputs: entry.inputs });
        }
    }

    encodeFunctionData(nameOrSig: string, values: any[] = []): string {
        const fn = this.functions.get(nameOrSig);
        if (fn) {
            return encodeFunctionData(fn.sig, values);
        }
        // Try as raw signature
        return encodeFunctionData(nameOrSig, values);
    }

    decodeFunctionResult(nameOrSig: string, data: string): any[] {
        const fn = this.functions.get(nameOrSig);
        if (fn) {
            return decodeFunctionResult(fn.sig, data);
        }
        return decodeFunctionResult(nameOrSig, data);
    }

    parseTransaction(tx: { data: string; value?: bigint }): { name: string; args: any[]; selector: string; value: bigint; fragment: { inputs: { name: string; type: string }[] } } | null {
        if (!tx.data || tx.data.length < 10) return null;
        const selector = tx.data.slice(0, 10);
        const fn = this.functionsBySelector.get(selector);
        if (!fn) return null;
        const args = fn.inputTypes.length > 0 ? decode(fn.inputTypes, '0x' + tx.data.slice(10)) : [];
        const fragment = { inputs: fn.inputTypes.map((t: string, i: number) => ({ name: fn.inputNames[i] || `arg${i}`, type: t })) };
        return { name: fn.name, args, selector, value: tx.value || 0n, fragment };
    }

    parseLog(log: { topics: string[]; data: string }): { name: string; args: Record<string, any>; topic: string } | null {
        if (!log.topics || log.topics.length === 0) return null;
        const evt = this.eventsByTopic.get(log.topics[0]);
        if (!evt) return null;

        const args: Record<string, any> = {};
        let topicIdx = 1;
        const nonIndexed: { type: string; name: string }[] = [];

        for (const input of evt.inputs) {
            if (input.indexed) {
                const raw = log.topics[topicIdx++];
                if (raw) {
                    const slot = raw.startsWith('0x') ? raw.slice(2) : raw;
                    if (input.type === 'address') {
                        args[input.name] = '0x' + slot.slice(24);
                    } else if (input.type.startsWith('uint') || input.type.startsWith('int')) {
                        args[input.name] = BigInt('0x' + slot);
                    } else {
                        args[input.name] = raw;
                    }
                }
            } else {
                nonIndexed.push(input);
            }
        }

        if (nonIndexed.length > 0 && log.data && log.data !== '0x') {
            const decoded = decode(nonIndexed.map(p => p.type), log.data);
            for (let i = 0; i < nonIndexed.length; i++) {
                args[nonIndexed[i].name] = decoded[i];
            }
        }

        return { name: evt.name, args, topic: log.topics[0] };
    }

    parseError(data: string): { name: string; args: any[]; selector: string } | null {
        if (!data || data.length < 10) return null;
        const selector = data.slice(0, 10);
        const err = this.errorsBySelector.get(selector);
        if (!err) return null;
        const args = err.inputTypes.length > 0 ? decode(err.inputTypes, '0x' + data.slice(10)) : [];
        return { name: err.name, args, selector };
    }

    getFunction(name: string): ParsedFunction | undefined {
        return this.functions.get(name);
    }

    getEvent(name: string): ParsedEvent | undefined {
        return this.events.get(name);
    }

    /** ethers compat: forEachFunction */
    forEachFunction(callback: (fn: any) => void): void {
        for (const fn of this.functions.values()) {
            callback(fn);
        }
    }

    /** ethers compat: forEachEvent */
    forEachEvent(callback: (evt: any) => void): void {
        for (const evt of this.events.values()) {
            callback(evt);
        }
    }
}
