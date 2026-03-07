import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as ethers from 'ethers';
import { getAddress, isAddress, computeAddress } from '../src/address.js';

describe('getAddress (EIP-55 checksum)', () => {
    const addresses = [
        '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', // vitalik.eth
        '0x0000000000000000000000000000000000000000',
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
        '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
        '0xdead000000000000000000000000000000000000',
        '0x1234567890abcdef1234567890abcdef12345678',
        '0xffffffffffffffffffffffffffffffffffffffff',
    ];
    for (const addr of addresses) {
        it(`getAddress("${addr}")`, () => {
            assert.equal(getAddress(addr), ethers.getAddress(addr));
        });
    }

    it('lowercased input', () => {
        const lower = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
        assert.equal(getAddress(lower), ethers.getAddress(lower));
    });

    it('uppercased input', () => {
        const upper = '0xD8DA6BF26964AF9D7EED9E03E53415D37AA96045';
        assert.equal(getAddress(upper), ethers.getAddress(upper));
    });

    it('throws on invalid address', () => {
        assert.throws(() => getAddress('0x123'));
        assert.throws(() => getAddress('not an address'));
    });
});

describe('isAddress', () => {
    it('valid addresses', () => {
        assert.equal(isAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'), true);
        assert.equal(isAddress('0x0000000000000000000000000000000000000000'), true);
    });

    it('invalid addresses', () => {
        assert.equal(isAddress('0x123'), false);
        assert.equal(isAddress('not an address'), false);
        assert.equal(isAddress(''), false);
    });
});

describe('computeAddress', () => {
    it('derives address from known private key', () => {
        // Use a test private key
        const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
        const wallet = new ethers.Wallet(privateKey);
        const ethersAddress = wallet.address;

        // Get the uncompressed public key from ethers
        const signingKey = new ethers.SigningKey(privateKey);
        const uncompressedKey = signingKey.publicKey;

        // Convert to Uint8Array (ethers returns 0x04 + 64 bytes)
        const keyBytes = ethers.getBytes(uncompressedKey);
        const ourAddress = computeAddress(keyBytes);

        assert.equal(ourAddress, ethersAddress);
    });
});
