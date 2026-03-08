const WEI_PER_ETHER = 10n ** 18n;

const NAMED_UNITS: Record<string, number> = {
    'wei': 0, 'kwei': 3, 'mwei': 6, 'gwei': 9, 'szabo': 12, 'finney': 15, 'ether': 18,
};

function resolveDecimals(decimals: number | string): number {
    if (typeof decimals === 'string') {
        const d = NAMED_UNITS[decimals];
        if (d === undefined) throw new Error(`Unknown unit: ${decimals}`);
        return d;
    }
    return decimals;
}

export function parseEther(value: string): bigint {
    return parseUnits(value, 18);
}

export function formatEther(wei: bigint): string {
    return formatUnits(wei, 18);
}

export function formatUnits(value: bigint | number | string, decimals: number | string): string {
    const d = resolveDecimals(decimals);
    const divisor = 10n ** BigInt(d);
    let v = BigInt(value);
    const negative = v < 0n;
    if (negative) v = -v;
    const whole = v / divisor;
    const remainder = v % divisor;
    const fracStr = remainder.toString().padStart(d, '0').replace(/0+$/, '') || '0';
    const result = whole.toString() + '.' + fracStr;
    return negative ? '-' + result : result;
}

export function parseUnits(value: string, decimals: number | string): bigint {
    const d = resolveDecimals(decimals);
    const negative = value.startsWith('-');
    if (negative) value = value.slice(1);
    const dot = value.indexOf('.');
    if (dot === -1) {
        const result = BigInt(value) * 10n ** BigInt(d);
        return negative ? -result : result;
    }
    const whole = value.slice(0, dot);
    const fracRaw = value.slice(dot + 1);
    if (fracRaw.length > d) throw new Error('too many decimals for format');
    const frac = fracRaw.padEnd(d, '0');
    const result = BigInt(whole || '0') * 10n ** BigInt(d) + BigInt(frac);
    return negative ? -result : result;
}
