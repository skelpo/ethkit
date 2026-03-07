import { keccak256, toUtf8Bytes, toUtf8String, hexToBytes, bytesToHex, zeroPad } from './hash.js';

// --- ABI Type Encoding ---

/** Encode a single ABI value to 32-byte hex (no 0x prefix) */
function encodeValue(type: string, value: any): string {
    if (type === 'address') {
        return (value as string).toLowerCase().replace('0x', '').padStart(64, '0');
    }
    if (type === 'bool') {
        return value ? '0000000000000000000000000000000000000000000000000000000000000001'
                     : '0000000000000000000000000000000000000000000000000000000000000000';
    }
    if (type.startsWith('uint')) {
        const v = BigInt(value);
        return v.toString(16).padStart(64, '0');
    }
    if (type.startsWith('int')) {
        const v = BigInt(value);
        if (v >= 0n) return v.toString(16).padStart(64, '0');
        return ((1n << 256n) + v).toString(16).padStart(64, '0');
    }
    if (type.startsWith('bytes') && !type.endsWith('[]') && type !== 'bytes') {
        // Fixed-size bytes (bytes1..bytes32): right-padded
        const hex = (value as string).replace('0x', '');
        return hex.padEnd(64, '0');
    }
    throw new Error(`Unsupported static type: ${type}`);
}

/** Check if a type is dynamic (variable-length) */
function isDynamic(type: string): boolean {
    return type === 'string' || type === 'bytes' || type.endsWith('[]');
}

/** Encode dynamic data, returns hex without 0x prefix */
function encodeDynamic(type: string, value: any): string {
    if (type === 'string') {
        const strBytes = toUtf8Bytes(value as string);
        const len = strBytes.length;
        const padded = Math.ceil(len / 32) * 32;
        let hex = BigInt(len).toString(16).padStart(64, '0');
        hex += bytesToHex(strBytes).padEnd(padded * 2, '0');
        return hex;
    }
    if (type === 'bytes') {
        const raw = (value as string).replace('0x', '');
        const len = raw.length / 2;
        const padded = Math.ceil(len / 32) * 32;
        let hex = BigInt(len).toString(16).padStart(64, '0');
        hex += raw.padEnd(padded * 2, '0');
        return hex;
    }
    if (type.endsWith('[]')) {
        const baseType = type.slice(0, -2);
        const arr = value as any[];
        let hex = BigInt(arr.length).toString(16).padStart(64, '0');
        // For dynamic base types, we need offsets + data. For static, inline.
        if (isDynamic(baseType)) {
            const headSize = arr.length * 32;
            let offsets = '';
            let tails = '';
            for (const item of arr) {
                offsets += BigInt(headSize + tails.length / 2).toString(16).padStart(64, '0');
                tails += encodeDynamic(baseType, item);
            }
            hex += offsets + tails;
        } else {
            for (const item of arr) {
                hex += encodeValue(baseType, item);
            }
        }
        return hex;
    }
    throw new Error(`Unsupported dynamic type: ${type}`);
}

/** ABI-encode parameters given types and values */
export function encode(types: string[], values: any[]): string {
    if (types.length !== values.length) {
        throw new Error(`Type/value count mismatch: ${types.length} types, ${values.length} values`);
    }

    // All static values go in head, dynamic values get offset in head + data in tail
    const headSize = types.length * 32;
    let head = '';
    let tail = '';

    for (let i = 0; i < types.length; i++) {
        if (isDynamic(types[i])) {
            // Write offset to tail section
            head += BigInt(headSize + tail.length / 2).toString(16).padStart(64, '0');
            tail += encodeDynamic(types[i], values[i]);
        } else {
            head += encodeValue(types[i], values[i]);
        }
    }

    return '0x' + head + tail;
}

/** ABI-decode a hex result given types. Returns array of decoded values. */
export function decode(types: string[], data: string): any[] {
    if (data.startsWith('0x')) data = data.slice(2);
    const results: any[] = [];

    for (let i = 0; i < types.length; i++) {
        const type = types[i];
        if (isDynamic(type)) {
            const offset = Number(BigInt('0x' + data.slice(i * 64, i * 64 + 64)));
            results.push(decodeDynamic(type, data, offset * 2));
        } else {
            results.push(decodeValue(type, data, i * 64));
        }
    }

    return results;
}

function decodeValue(type: string, data: string, offset: number): any {
    const slot = data.slice(offset, offset + 64);
    if (type === 'address') {
        return '0x' + slot.slice(24);
    }
    if (type === 'bool') {
        return BigInt('0x' + slot) !== 0n;
    }
    if (type.startsWith('uint')) {
        return BigInt('0x' + slot);
    }
    if (type.startsWith('int')) {
        const val = BigInt('0x' + slot);
        const max = 1n << 255n;
        return val >= max ? val - (1n << 256n) : val;
    }
    if (type.startsWith('bytes') && type !== 'bytes') {
        const size = parseInt(type.replace('bytes', ''));
        return '0x' + slot.slice(0, size * 2);
    }
    throw new Error(`Unsupported decode type: ${type}`);
}

function decodeDynamic(type: string, data: string, offset: number): any {
    if (type === 'string') {
        const len = Number(BigInt('0x' + data.slice(offset, offset + 64)));
        const hex = data.slice(offset + 64, offset + 64 + len * 2);
        return toUtf8String(hexToBytes(hex));
    }
    if (type === 'bytes') {
        const len = Number(BigInt('0x' + data.slice(offset, offset + 64)));
        return '0x' + data.slice(offset + 64, offset + 64 + len * 2);
    }
    if (type.endsWith('[]')) {
        const baseType = type.slice(0, -2);
        const len = Number(BigInt('0x' + data.slice(offset, offset + 64)));
        const arrData = data.slice(offset + 64);
        const results: any[] = [];
        for (let i = 0; i < len; i++) {
            if (isDynamic(baseType)) {
                const itemOffset = Number(BigInt('0x' + arrData.slice(i * 64, i * 64 + 64)));
                results.push(decodeDynamic(baseType, arrData, itemOffset * 2));
            } else {
                results.push(decodeValue(baseType, arrData, i * 64));
            }
        }
        return results;
    }
    throw new Error(`Unsupported dynamic decode type: ${type}`);
}

// --- Function Selector & Signature Parsing ---

/** Parse "functionName(type1,type2,...)" or "function functionName(type1) view returns (type2)" into { name, inputs, outputs } */
export function parseSignature(sig: string): { name: string; inputs: string[]; outputs: string[] } {
    // Strip leading "function " keyword if present
    let s = sig.trim();
    if (s.startsWith('function ')) s = s.slice(9);
    // Strip leading "event " keyword if present
    if (s.startsWith('event ')) s = s.slice(6);

    const match = s.match(/^(\w+)\(([^)]*)\)(?:\s*(?:returns|view|pure|external|public|nonpayable|payable)\s*)*(?:\(([^)]*)\))?/);
    if (!match) throw new Error(`Invalid function signature: ${sig}`);
    const name = match[1];
    const inputs = match[2] ? match[2].split(',').map(t => t.trim().split(/\s+/)[0]).filter(t => t.length > 0) : [];
    const outputs = match[3] ? match[3].split(',').map(t => t.trim().split(/\s+/)[0]).filter(t => t.length > 0) : [];
    return { name, inputs, outputs };
}

/** Get 4-byte function selector from signature */
export function functionSelector(sig: string): string {
    const { name, inputs } = parseSignature(sig);
    const canonical = name + '(' + inputs.join(',') + ')';
    return keccak256(toUtf8Bytes(canonical)).slice(0, 10);
}

/** Get event topic0 from signature */
export function eventTopic(sig: string): string {
    // Events: "EventName(type1,type2,...)"
    const match = sig.match(/^(\w+)\(([^)]*)\)/);
    if (!match) throw new Error(`Invalid event signature: ${sig}`);
    const canonical = match[1] + '(' + (match[2] ? match[2].split(',').map(t => t.trim().split(' ')[0]).join(',') : '') + ')';
    return keccak256(toUtf8Bytes(canonical));
}

/** Encode a function call: selector + encoded args */
export function encodeFunctionData(sig: string, values: any[]): string {
    const selector = functionSelector(sig);
    const { inputs } = parseSignature(sig);
    if (inputs.length === 0 && values.length === 0) return selector;
    const encoded = encode(inputs, values);
    return selector + encoded.slice(2); // strip 0x from encoded
}

/** Decode a function result given the signature */
export function decodeFunctionResult(sig: string, data: string): any[] {
    const { outputs } = parseSignature(sig);
    if (outputs.length === 0) return [];
    return decode(outputs, data);
}

// --- Event Log Decoding ---

export interface EventFragment {
    name: string;
    topic: string;
    inputs: { type: string; indexed: boolean; name: string }[];
}

/** Parse an event ABI string like "event Transfer(address indexed from, address indexed to, uint256 value)" */
export function parseEvent(sig: string): EventFragment {
    const match = sig.match(/^event\s+(\w+)\(([^)]*)\)/);
    if (!match) throw new Error(`Invalid event signature: ${sig}`);
    const name = match[1];
    const params = match[2] ? match[2].split(',').map(p => {
        const parts = p.trim().split(/\s+/);
        const indexed = parts.includes('indexed');
        const type = parts[0];
        const paramName = parts[parts.length - 1] === 'indexed' ? parts[parts.length - 1] : parts[parts.length - 1];
        return { type, indexed, name: paramName };
    }) : [];

    const canonical = name + '(' + params.map(p => p.type).join(',') + ')';
    const topic = keccak256(toUtf8Bytes(canonical));

    return { name, topic, inputs: params };
}

/** Decode event log data given an EventFragment */
export function decodeEventLog(event: EventFragment, log: { topics: string[]; data: string }): Record<string, any> {
    const result: Record<string, any> = {};
    let topicIndex = 1; // topic[0] is the event signature
    const nonIndexed: { type: string; name: string }[] = [];

    for (const input of event.inputs) {
        if (input.indexed) {
            const raw = log.topics[topicIndex++];
            if (raw) {
                result[input.name] = decodeValue(input.type, raw.replace('0x', ''), 0);
            }
        } else {
            nonIndexed.push(input);
        }
    }

    if (nonIndexed.length > 0) {
        const decoded = decode(nonIndexed.map(p => p.type), log.data);
        for (let i = 0; i < nonIndexed.length; i++) {
            result[nonIndexed[i].name] = decoded[i];
        }
    }

    return result;
}
