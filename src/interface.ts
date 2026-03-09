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

/** Interface instance type (for use as a type annotation) */
export interface Interface {
    functions: Record<string, ParsedFunction>;
    functionsBySelector: Record<string, ParsedFunction>;
    events: Record<string, ParsedEvent>;
    eventsByTopic: Record<string, ParsedEvent>;
    errors: Record<string, ParsedError>;
    errorsBySelector: Record<string, ParsedError>;
    fragments: any[];
    encodeFunctionData(nameOrSig: string, values?: any[]): string;
    decodeFunctionResult(nameOrSig: string, data: string): any[];
    parseTransaction(tx: { data: string; value?: bigint }): any;
    parseLog(log: { topics: string[]; data: string }): any;
    parseError(data: string): any;
    getFunction(name: string): ParsedFunction | undefined;
    getEvent(name: string): ParsedEvent | undefined;
    forEachFunction(callback: (fn: any) => void): void;
    forEachEvent(callback: (evt: any) => void): void;
}

/**
 * Drop-in replacement for ethers.Interface.
 * Implemented as a constructor function (not a class) for Perry compatibility.
 */
export function Interface(abi: (string | AbiEntry)[]): Interface {
    const functions: Record<string, ParsedFunction> = {};
    const functionsBySelector: Record<string, ParsedFunction> = {};
    const events: Record<string, ParsedEvent> = {};
    const eventsByTopic: Record<string, ParsedEvent> = {};
    const errors: Record<string, ParsedError> = {};
    const errorsBySelector: Record<string, ParsedError> = {};
    const fragments: any[] = [];

    for (let idx = 0; idx < abi.length; idx++) {
        const entry = abi[idx];
        if (typeof entry === 'string') {
            parseStringEntry(entry);
        } else {
            parseJsonEntry(entry);
        }
    }

    function parseStringEntry(entry: string) {
        const trimmed = entry.trim();
        const isFunc = trimmed.startsWith('function ') || (!trimmed.startsWith('event ') && !trimmed.startsWith('error ') && trimmed.includes('('));
        if (isFunc) {
            const parsed = parseSignature(trimmed);
            const sig = parsed.name + '(' + parsed.inputs.join(',') + ')';
            const selector = keccak256(toUtf8Bytes(sig)).slice(0, 10);
            const fn: ParsedFunction = {
                name: parsed.name,
                sig: trimmed,
                selector,
                inputTypes: parsed.inputs,
                inputNames: parsed.inputs.map((_: string, i: number) => 'arg' + i),
                outputTypes: parsed.outputs,
                stateMutability: trimmed.includes('view') ? 'view' : trimmed.includes('pure') ? 'pure' : 'nonpayable',
            };
            functions[parsed.name] = fn;
            functionsBySelector[selector] = fn;
            fragments.push({ name: parsed.name, type: 'function' });
        } else if (trimmed.startsWith('event ')) {
            const match = trimmed.match(/^event\s+(\w+)\(([^)]*)\)/);
            if (match) {
                const name = match[1];
                const params = match[2] ? match[2].split(',').map((p: string) => {
                    const parts = p.trim().split(/\s+/);
                    const indexed = parts.includes('indexed');
                    return { type: parts[0], indexed, name: parts[parts.length - 1] };
                }) : [];
                const canonical = name + '(' + params.map((p: any) => p.type).join(',') + ')';
                const topicHash = keccak256(toUtf8Bytes(canonical));
                const evt: ParsedEvent = { name, topicHash, inputs: params };
                events[name] = evt;
                eventsByTopic[topicHash] = evt;
                fragments.push({ name, type: 'event' });
            }
        } else if (trimmed.startsWith('error ')) {
            const match = trimmed.match(/^error\s+(\w+)\(([^)]*)\)/);
            if (match) {
                const name = match[1];
                const inputTypes = match[2] ? match[2].split(',').map((t: string) => t.trim().split(/\s+/)[0]) : [];
                const canonical = name + '(' + inputTypes.join(',') + ')';
                const selector = keccak256(toUtf8Bytes(canonical)).slice(0, 10);
                const err: ParsedError = { name, selector, inputTypes };
                errors[name] = err;
                errorsBySelector[selector] = err;
                fragments.push({ name, type: 'error' });
            }
        }
    }

    function parseJsonEntry(entry: AbiEntry) {
        if (entry.type === 'function' && entry.name) {
            const inputTypes = (entry.inputs || []).map(resolveType);
            const outputTypes = (entry.outputs || []).map(resolveType);
            const sig = entry.name + '(' + inputTypes.join(',') + ') returns (' + outputTypes.join(',') + ')';
            const canonical = entry.name + '(' + inputTypes.join(',') + ')';
            const selector = keccak256(toUtf8Bytes(canonical)).slice(0, 10);
            const fn: ParsedFunction = {
                name: entry.name,
                sig,
                selector,
                inputTypes,
                inputNames: (entry.inputs || []).map((inp: any, i: number) => inp.name || ('arg' + i)),
                outputTypes,
                stateMutability: entry.stateMutability || 'nonpayable',
            };
            functions[entry.name] = fn;
            functionsBySelector[selector] = fn;
            fragments.push({ name: entry.name, type: 'function', inputs: entry.inputs, outputs: entry.outputs });
        } else if (entry.type === 'event' && entry.name) {
            const inputs = (entry.inputs || []).map((i: any) => ({
                type: resolveType(i),
                indexed: i.indexed || false,
                name: i.name || '',
            }));
            const canonical = entry.name + '(' + inputs.map((i: any) => i.type).join(',') + ')';
            const topicHash = keccak256(toUtf8Bytes(canonical));
            const evt: ParsedEvent = { name: entry.name, topicHash, inputs };
            events[entry.name] = evt;
            eventsByTopic[topicHash] = evt;
            fragments.push({ name: entry.name, type: 'event', inputs: entry.inputs });
        } else if (entry.type === 'error' && entry.name) {
            const inputTypes = (entry.inputs || []).map(resolveType);
            const canonical = entry.name + '(' + inputTypes.join(',') + ')';
            const selector = keccak256(toUtf8Bytes(canonical)).slice(0, 10);
            const err: ParsedError = { name: entry.name, selector, inputTypes };
            errors[entry.name] = err;
            errorsBySelector[selector] = err;
            fragments.push({ name: entry.name, type: 'error', inputs: entry.inputs });
        }
    }

    return {
        functions,
        functionsBySelector,
        events,
        eventsByTopic,
        errors,
        errorsBySelector,
        fragments,

        encodeFunctionData(nameOrSig: string, values: any[]): string {
            const fn = functions[nameOrSig];
            if (fn) {
                return encodeFunctionData(fn.sig, values || []);
            }
            return encodeFunctionData(nameOrSig, values || []);
        },

        decodeFunctionResult(nameOrSig: string, data: string): any[] {
            const fn = functions[nameOrSig];
            if (fn) {
                return decodeFunctionResult(fn.sig, data);
            }
            return decodeFunctionResult(nameOrSig, data);
        },

        parseTransaction(tx: { data: string; value?: bigint }): any {
            if (!tx.data || tx.data.length < 10) return null;
            const selector = tx.data.slice(0, 10);
            const fn = functionsBySelector[selector];
            if (!fn) return null;
            const args = fn.inputTypes.length > 0 ? decode(fn.inputTypes, '0x' + tx.data.slice(10)) : [];
            const fragment = { inputs: fn.inputTypes.map((t: string, i: number) => ({ name: fn.inputNames[i] || ('arg' + i), type: t })) };
            return { name: fn.name, args, selector, value: tx.value || 0n, fragment };
        },

        parseLog(log: { topics: string[]; data: string }): any {
            if (!log.topics || log.topics.length === 0) return null;
            const evt = eventsByTopic[log.topics[0]];
            if (!evt) return null;

            const args: Record<string, any> = {};
            let topicIdx = 1;
            const nonIndexed: { type: string; name: string }[] = [];

            for (let i = 0; i < evt.inputs.length; i++) {
                const input = evt.inputs[i];
                if (input.indexed) {
                    const raw = log.topics[topicIdx];
                    topicIdx++;
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
                const decoded = decode(nonIndexed.map((p: any) => p.type), log.data);
                for (let i = 0; i < nonIndexed.length; i++) {
                    args[nonIndexed[i].name] = decoded[i];
                }
            }

            return { name: evt.name, args, topic: log.topics[0] };
        },

        parseError(data: string): any {
            if (!data || data.length < 10) return null;
            const selector = data.slice(0, 10);
            const err = errorsBySelector[selector];
            if (!err) return null;
            const args = err.inputTypes.length > 0 ? decode(err.inputTypes, '0x' + data.slice(10)) : [];
            return { name: err.name, args, selector };
        },

        getFunction(name: string): ParsedFunction | undefined {
            return functions[name];
        },

        getEvent(name: string): ParsedEvent | undefined {
            return events[name];
        },

        forEachFunction(callback: (fn: any) => void): void {
            const keys = Object.keys(functions);
            for (let i = 0; i < keys.length; i++) {
                callback(functions[keys[i]]);
            }
        },

        forEachEvent(callback: (evt: any) => void): void {
            const keys = Object.keys(events);
            for (let i = 0; i < keys.length; i++) {
                callback(events[keys[i]]);
            }
        },
    };
}
