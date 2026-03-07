import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as ethers from 'ethers';
import { parseEther, formatEther, parseUnits, formatUnits } from '../src/index.js';

describe('parseEther', () => {
    const cases = ['0', '1', '0.1', '0.000000000000000001', '1234567.89', '100', '999999999999999999'];
    for (const v of cases) {
        it(`parseEther("${v}")`, () => {
            assert.equal(parseEther(v), ethers.parseEther(v));
        });
    }

    it('handles negative values', () => {
        assert.equal(parseEther('-1'), ethers.parseEther('-1'));
        assert.equal(parseEther('-0.5'), ethers.parseEther('-0.5'));
    });
});

describe('formatEther', () => {
    const eth = 1000000000000000000n;
    const cases = [0n, 1n, eth, eth / 10n, 123456789012345678n, eth * 1000000n];
    for (const v of cases) {
        it(`formatEther(${v}n)`, () => {
            assert.equal(formatEther(v), ethers.formatEther(v));
        });
    }

    it('handles negative values', () => {
        const negOne = -1000000000000000000n;
        assert.equal(formatEther(negOne), ethers.formatEther(negOne));
    });
});

describe('parseUnits', () => {
    const decimalCases: [string, number][] = [
        ['1', 6], ['0.000001', 6], ['1000', 6],
        ['1', 8], ['0.00000001', 8],
        ['1', 18], ['0.1', 18], ['0', 18],
        ['123.456', 9],
    ];
    for (const [v, d] of decimalCases) {
        it(`parseUnits("${v}", ${d})`, () => {
            assert.equal(parseUnits(v, d), ethers.parseUnits(v, d));
        });
    }

    it('named units: gwei', () => {
        assert.equal(parseUnits('1', 'gwei'), ethers.parseUnits('1', 'gwei'));
        assert.equal(parseUnits('2.5', 'gwei'), ethers.parseUnits('2.5', 'gwei'));
    });

    it('named units: ether', () => {
        assert.equal(parseUnits('1', 'ether'), ethers.parseUnits('1', 'ether'));
    });

    it('throws on excess decimals', () => {
        assert.throws(() => parseUnits('1.1234567', 4));
        assert.throws(() => ethers.parseUnits('1.1234567', 4));
    });
});

describe('formatUnits', () => {
    const cases: [bigint, number][] = [
        [1000000n, 6], [0n, 6], [1n, 6], [123456n, 6],
        [100000000n, 8], [1n, 8],
        [10n ** 18n, 18], [10n ** 9n, 18], [1n, 18],
        [2500000000n, 9],
    ];
    for (const [v, d] of cases) {
        it(`formatUnits(${v}n, ${d})`, () => {
            assert.equal(formatUnits(v, d), ethers.formatUnits(v, d));
        });
    }

    it('named units: gwei', () => {
        assert.equal(formatUnits(1000000000n, 'gwei'), ethers.formatUnits(1000000000n, 'gwei'));
    });

    it('large values', () => {
        const large = 123456789012345678901234n;
        assert.equal(formatUnits(large, 18), ethers.formatUnits(large, 18));
    });

    it('negative values', () => {
        assert.equal(formatUnits(-1000000n, 6), ethers.formatUnits(-1000000n, 6));
    });
});
