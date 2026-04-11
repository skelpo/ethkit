import { keccak256, toUtf8Bytes, toUtf8String, hexToBytes, bytesToHex } from './hash.js';
// --- ABI Type Encoding ---
/** Encode a single ABI value to 32-byte hex (no 0x prefix) */
function encodeValue(type, value) {
    if (type === 'address') {
        return value.toLowerCase().replace('0x', '').padStart(64, '0');
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
        if (v >= 0n)
            return v.toString(16).padStart(64, '0');
        return ((1n << 256n) + v).toString(16).padStart(64, '0');
    }
    if (type.startsWith('bytes') && !type.endsWith('[]') && type !== 'bytes') {
        // Fixed-size bytes (bytes1..bytes32): right-padded
        const hex = value.replace('0x', '');
        return hex.padEnd(64, '0');
    }
    // Static tuple: all components are static, encoded inline
    if (type.startsWith('(') && type.endsWith(')')) {
        return encodeTuple(parseTupleComponents(type), value);
    }
    throw new Error(`Unsupported static type: ${type}`);
}
/** Check if a type is dynamic (variable-length) */
function isDynamic(type) {
    if (type === 'string' || type === 'bytes' || type.endsWith('[]'))
        return true;
    // Tuple is dynamic if any component is dynamic
    if (type.startsWith('(') && type.endsWith(')')) {
        return parseTupleComponents(type).some(isDynamic);
    }
    return false;
}
/** Parse tuple type string "(type1,type2,...)" into component types */
function parseTupleComponents(type) {
    // Strip outer parens
    const inner = type.slice(1, -1);
    return splitTopLevelParams(inner);
}
/** Encode dynamic data, returns hex without 0x prefix */
function encodeDynamic(type, value) {
    if (type === 'string') {
        const strBytes = toUtf8Bytes(value);
        const len = strBytes.length;
        const padded = Math.ceil(len / 32) * 32;
        let hex = BigInt(len).toString(16).padStart(64, '0');
        hex += bytesToHex(strBytes).padEnd(padded * 2, '0');
        return hex;
    }
    if (type === 'bytes') {
        const raw = value.replace('0x', '');
        const len = raw.length / 2;
        const padded = Math.ceil(len / 32) * 32;
        let hex = BigInt(len).toString(16).padStart(64, '0');
        hex += raw.padEnd(padded * 2, '0');
        return hex;
    }
    if (type.endsWith('[]')) {
        const baseType = type.slice(0, -2);
        const arr = value;
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
        }
        else {
            for (const item of arr) {
                hex += encodeValue(baseType, item);
            }
        }
        return hex;
    }
    // Dynamic tuple: encode as head (offsets for dynamic components) + tail
    if (type.startsWith('(') && type.endsWith(')')) {
        return encodeTuple(parseTupleComponents(type), value);
    }
    throw new Error(`Unsupported dynamic type: ${type}`);
}
/** Encode a tuple value. Value can be an array or object with named keys. */
function encodeTuple(components, value) {
    let vals;
    if (Array.isArray(value)) {
        vals = value;
    }
    else {
        // Object: try numeric keys first, then fall back to property insertion order
        const numericVal = components.map((_, i) => value[i]);
        if (numericVal[0] !== undefined) {
            vals = numericVal;
        }
        else {
            vals = Object.values(value);
        }
    }
    const headSize = components.length * 32;
    let head = '';
    let tail = '';
    for (let i = 0; i < components.length; i++) {
        if (isDynamic(components[i])) {
            head += BigInt(headSize + tail.length / 2).toString(16).padStart(64, '0');
            tail += encodeDynamic(components[i], vals[i]);
        }
        else {
            head += encodeValue(components[i], vals[i]);
        }
    }
    return head + tail;
}
/** ABI-encode parameters given types and values */
export function encode(types, values) {
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
        }
        else {
            head += encodeValue(types[i], values[i]);
        }
    }
    return '0x' + head + tail;
}
/** ABI-decode a hex result given types. Returns array of decoded values. */
export function decode(types, data) {
    if (data.startsWith('0x'))
        data = data.slice(2);
    const results = [];
    for (let i = 0; i < types.length; i++) {
        const type = types[i];
        if (isDynamic(type)) {
            const offset = Number(BigInt('0x' + data.slice(i * 64, i * 64 + 64)));
            results.push(decodeDynamic(type, data, offset * 2));
        }
        else {
            results.push(decodeValue(type, data, i * 64));
        }
    }
    return results;
}
function decodeValue(type, data, offset) {
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
    // Static tuple: decode each component inline
    if (type.startsWith('(') && type.endsWith(')')) {
        return decodeTuple(parseTupleComponents(type), data, offset);
    }
    throw new Error(`Unsupported decode type: ${type}`);
}
function decodeDynamic(type, data, offset) {
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
        const results = [];
        for (let i = 0; i < len; i++) {
            if (isDynamic(baseType)) {
                const itemOffset = Number(BigInt('0x' + arrData.slice(i * 64, i * 64 + 64)));
                results.push(decodeDynamic(baseType, arrData, itemOffset * 2));
            }
            else {
                results.push(decodeValue(baseType, arrData, i * 64));
            }
        }
        return results;
    }
    // Dynamic tuple: has offset-based layout for dynamic components
    if (type.startsWith('(') && type.endsWith(')')) {
        return decodeTuple(parseTupleComponents(type), data, offset);
    }
    throw new Error(`Unsupported dynamic decode type: ${type}`);
}
/** Decode a tuple from ABI data at the given hex-char offset */
function decodeTuple(components, data, offset) {
    const results = [];
    const tupleData = data.slice(offset);
    let slotIdx = 0;
    for (const comp of components) {
        if (isDynamic(comp)) {
            const dynOffset = Number(BigInt('0x' + tupleData.slice(slotIdx * 64, slotIdx * 64 + 64)));
            results.push(decodeDynamic(comp, tupleData, dynOffset * 2));
        }
        else {
            results.push(decodeValue(comp, tupleData, slotIdx * 64));
        }
        slotIdx++;
    }
    return results;
}
// --- Function Selector & Signature Parsing ---
/** Parse "functionName(type1,type2,...)" or "function functionName(type1) view returns (type2)" into { name, inputs, outputs } */
export function parseSignature(sig) {
    // Strip leading "function " keyword if present
    let s = sig.trim();
    if (s.startsWith('function '))
        s = s.slice(9);
    // Strip leading "event " keyword if present
    if (s.startsWith('event '))
        s = s.slice(6);
    // Extract function name
    const nameMatch = s.match(/^(\w+)/);
    if (!nameMatch)
        throw new Error(`Invalid function signature: ${sig}`);
    const name = nameMatch[1];
    // Find the balanced top-level parentheses for inputs
    const firstParen = s.indexOf('(');
    if (firstParen === -1)
        throw new Error(`Invalid function signature: ${sig}`);
    const inputEnd = findMatchingParen(s, firstParen);
    const inputStr = s.slice(firstParen + 1, inputEnd);
    // Find "returns" clause and its balanced parentheses
    let outputStr = '';
    const rest = s.slice(inputEnd + 1);
    const returnsIdx = rest.indexOf('returns');
    if (returnsIdx !== -1) {
        const afterReturns = rest.slice(returnsIdx + 7).trimStart();
        if (afterReturns.startsWith('(')) {
            const outEnd = findMatchingParen(afterReturns, 0);
            outputStr = afterReturns.slice(1, outEnd);
        }
    }
    const inputs = splitTopLevelParams(inputStr);
    const outputs = splitTopLevelParams(outputStr);
    return { name, inputs, outputs };
}
/** Find the index of the matching closing paren for the open paren at pos */
function findMatchingParen(s, pos) {
    let depth = 0;
    for (let i = pos; i < s.length; i++) {
        if (s[i] === '(')
            depth++;
        else if (s[i] === ')') {
            depth--;
            if (depth === 0)
                return i;
        }
    }
    return s.length;
}
/** Normalize shorthand Solidity types to canonical ABI types */
function normalizeType(type) {
    if (type === 'uint')
        return 'uint256';
    if (type === 'int')
        return 'int256';
    if (type === 'uint[]')
        return 'uint256[]';
    if (type === 'int[]')
        return 'int256[]';
    return type;
}
/** Extract the ABI type from a parameter string, handling tuples with named params */
function extractType(param) {
    param = param.trim();
    // Strip "tuple" keyword — e.g. "tuple(uint256,address)" → "(uint256,address)"
    if (param.startsWith('tuple(')) {
        param = param.slice(5); // remove "tuple", keep the "("
    }
    if (!param.startsWith('(')) {
        // Use string split instead of regex — Perry doesn't support split(regex) yet
        return normalizeType(param.split(' ')[0]);
    }
    // Tuple: find matching close paren
    let depth = 0;
    let closeIdx = 0;
    for (let i = 0; i < param.length; i++) {
        if (param[i] === '(')
            depth++;
        else if (param[i] === ')') {
            depth--;
            if (depth === 0) {
                closeIdx = i;
                break;
            }
        }
    }
    // Check for trailing [] (array of tuples)
    let end = closeIdx + 1;
    while (end < param.length && param[end] === '[') {
        const close = param.indexOf(']', end);
        if (close === -1)
            break;
        end = close + 1;
    }
    const inner = param.slice(1, closeIdx);
    const suffix = param.slice(closeIdx + 1, end);
    // Recursively extract types from inner params (strips names like "uint8 poolType" → "uint8")
    const innerTypes = splitTopLevelParams(inner);
    return '(' + innerTypes.join(',') + ')' + suffix;
}
/** Split a param string by commas, respecting nested parens (for tuple types) */
function splitTopLevelParams(s) {
    s = s.trim();
    if (!s)
        return [];
    const params = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < s.length; i++) {
        if (s[i] === '(')
            depth++;
        else if (s[i] === ')')
            depth--;
        else if (s[i] === ',' && depth === 0) {
            params.push(extractType(s.slice(start, i)));
            start = i + 1;
        }
    }
    params.push(extractType(s.slice(start)));
    return params.filter(t => t.length > 0);
}
/** Get 4-byte function selector from signature */
export function functionSelector(sig) {
    const { name, inputs } = parseSignature(sig);
    const canonical = name + '(' + inputs.join(',') + ')';
    return keccak256(toUtf8Bytes(canonical)).slice(0, 10);
}
/** Get event topic0 from signature */
export function eventTopic(sig) {
    // Events: "EventName(type1,type2,...)"
    const match = sig.match(/^(\w+)\(([^)]*)\)/);
    if (!match)
        throw new Error(`Invalid event signature: ${sig}`);
    const canonical = match[1] + '(' + (match[2] ? match[2].split(',').map(t => t.trim().split(' ')[0]).join(',') : '') + ')';
    return keccak256(toUtf8Bytes(canonical));
}
/** Encode a function call: selector + encoded args */
export function encodeFunctionData(sig, values) {
    const selector = functionSelector(sig);
    const { inputs } = parseSignature(sig);
    if (inputs.length === 0 && values.length === 0)
        return selector;
    const encoded = encode(inputs, values);
    return selector + encoded.slice(2); // strip 0x from encoded
}
/** Decode a function result given the signature */
export function decodeFunctionResult(sig, data) {
    const { outputs } = parseSignature(sig);
    if (outputs.length === 0)
        return [];
    return decode(outputs, data);
}
/** Parse an event ABI string like "event Transfer(address indexed from, address indexed to, uint256 value)" */
export function parseEvent(sig) {
    const match = sig.match(/^event\s+(\w+)\(([^)]*)\)/);
    if (!match)
        throw new Error(`Invalid event signature: ${sig}`);
    const name = match[1];
    const params = match[2] ? match[2].split(',').map(p => {
        const parts = p.trim().split(' ');
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
export function decodeEventLog(event, log) {
    const result = {};
    let topicIndex = 1; // topic[0] is the event signature
    const nonIndexed = [];
    for (const input of event.inputs) {
        if (input.indexed) {
            const raw = log.topics[topicIndex++];
            if (raw) {
                result[input.name] = decodeValue(input.type, raw.replace('0x', ''), 0);
            }
        }
        else {
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
//# sourceMappingURL=abi.js.map