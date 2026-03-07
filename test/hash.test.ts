import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as ethers from 'ethers';
import { keccak256, id, toUtf8Bytes, toUtf8String, hexToBytes, bytesToHex } from '../src/hash.js';

describe('keccak256', () => {
    it('hashes empty bytes', () => {
        const input = new Uint8Array(0);
        assert.equal(keccak256(input), ethers.keccak256(input));
    });

    it('hashes byte array', () => {
        const input = new Uint8Array([1, 2, 3, 4, 5]);
        assert.equal(keccak256(input), ethers.keccak256(input));
    });

    it('hashes hex string', () => {
        const input = '0xdeadbeef';
        assert.equal(keccak256(input), ethers.keccak256(input));
    });

    it('hashes UTF-8 string (via toUtf8Bytes)', () => {
        const input = 'hello world';
        assert.equal(keccak256(toUtf8Bytes(input)), ethers.keccak256(ethers.toUtf8Bytes(input)));
    });

    it('hashes long data', () => {
        const input = new Uint8Array(1000).fill(0xab);
        assert.equal(keccak256(input), ethers.keccak256(input));
    });

    it('hashes address-like bytes', () => {
        const addr = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
        assert.equal(keccak256(addr), ethers.keccak256(addr));
    });
});

describe('id', () => {
    const sigs = [
        'Transfer(address,address,uint256)',
        'Approval(address,address,uint256)',
        'Swap(address,uint256,uint256,uint256,uint256,address)',
        'transfer(address,uint256)',
        '',
    ];
    for (const sig of sigs) {
        it(`id("${sig}")`, () => {
            assert.equal(id(sig), ethers.id(sig));
        });
    }
});

describe('toUtf8Bytes / toUtf8String', () => {
    const strings = ['hello', '', 'Hello, World!', 'café', '日本語', '🚀🌍'];
    for (const s of strings) {
        it(`roundtrip "${s}"`, () => {
            const bytes = toUtf8Bytes(s);
            const ethersBytes = ethers.toUtf8Bytes(s);
            // Compare byte-for-byte
            assert.equal(bytes.length, ethersBytes.length, `length mismatch for "${s}"`);
            for (let i = 0; i < bytes.length; i++) {
                assert.equal(bytes[i], ethersBytes[i], `byte ${i} mismatch for "${s}"`);
            }
            // Roundtrip
            assert.equal(toUtf8String(bytes), s);
        });
    }
});

describe('hexToBytes / bytesToHex', () => {
    it('roundtrips', () => {
        const hex = '0xdeadbeef01020304';
        const bytes = hexToBytes(hex);
        assert.equal('0x' + bytesToHex(bytes), hex);
    });

    it('handles empty', () => {
        const bytes = hexToBytes('0x');
        assert.equal(bytes.length, 0);
        assert.equal(bytesToHex(new Uint8Array(0)), '');
    });

    it('handles odd-length hex', () => {
        const bytes = hexToBytes('0xf');
        assert.equal(bytes.length, 1);
        assert.equal(bytes[0], 0x0f);
    });
});
