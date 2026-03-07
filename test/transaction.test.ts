import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as ethers from 'ethers';
import { serializeEip1559, serializeSignedEip1559, serializeLegacy, serializeSignedLegacy, transactionHash } from '../src/transaction.js';
import { createWallet } from '../src/wallet.js';

describe('EIP-1559 transaction serialization', () => {
    it('signing hash matches ethers', () => {
        const tx = {
            chainId: 1,
            nonce: 0,
            maxPriorityFeePerGas: 1000000000n,
            maxFeePerGas: 50000000000n,
            gasLimit: 21000n,
            to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
            value: 1000000000000000000n, // 1 ETH
            data: '0x',
        };

        const { signingHash } = serializeEip1559(tx);

        // ethers constructs the same thing
        const ethersTx = ethers.Transaction.from({
            type: 2,
            chainId: 1,
            nonce: 0,
            maxPriorityFeePerGas: 1000000000n,
            maxFeePerGas: 50000000000n,
            gasLimit: 21000n,
            to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
            value: 1000000000000000000n,
            data: '0x',
        });

        assert.equal(signingHash, ethersTx.unsignedHash);
    });

    it('signed tx matches ethers', async () => {
        const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
        const tx = {
            type: 2,
            chainId: 1,
            nonce: 5,
            maxPriorityFeePerGas: 2000000000n,
            maxFeePerGas: 30000000000n,
            gasLimit: 21000n,
            to: '0x0000000000000000000000000000000000000001',
            value: 0n,
        };

        // Sign with ethers
        const ethersWallet = new ethers.Wallet(privateKey);
        const ethersSigned = await ethersWallet.signTransaction(tx);

        // Sign with ethkit
        const ourWallet = createWallet(privateKey);
        const ourSigned = await ourWallet.signTransaction(tx);

        assert.equal(ourSigned, ethersSigned);
    });
});

describe('Legacy transaction serialization', () => {
    it('signing hash matches ethers', () => {
        const tx = {
            chainId: 1,
            nonce: 0,
            gasPrice: 20000000000n,
            gasLimit: 21000n,
            to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
            value: 1000000000000000000n,
            data: '0x',
        };

        const { signingHash } = serializeLegacy(tx);

        const ethersTx = ethers.Transaction.from({
            type: 0,
            chainId: 1,
            nonce: 0,
            gasPrice: 20000000000n,
            gasLimit: 21000n,
            to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
            value: 1000000000000000000n,
            data: '0x',
        });

        assert.equal(signingHash, ethersTx.unsignedHash);
    });

    it('signed legacy tx matches ethers', async () => {
        const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
        const tx = {
            type: 0,
            chainId: 1,
            nonce: 3,
            gasPrice: 20000000000n,
            gasLimit: 21000n,
            to: '0x0000000000000000000000000000000000000001',
            value: 500000000000000000n,
        };

        const ethersWallet = new ethers.Wallet(privateKey);
        const ethersSigned = await ethersWallet.signTransaction(tx);

        const ourWallet = createWallet(privateKey);
        const ourSigned = await ourWallet.signTransaction(tx);

        assert.equal(ourSigned, ethersSigned);
    });
});

describe('transactionHash', () => {
    it('hash of signed tx matches ethers', async () => {
        const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
        const tx = {
            type: 2,
            chainId: 1,
            nonce: 10,
            maxPriorityFeePerGas: 1500000000n,
            maxFeePerGas: 25000000000n,
            gasLimit: 21000n,
            to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
            value: 100000000000000000n,
        };

        const ethersWallet = new ethers.Wallet(privateKey);
        const signed = await ethersWallet.signTransaction(tx);
        const ethersHash = ethers.keccak256(signed);

        const ourHash = transactionHash(signed);
        assert.equal(ourHash, ethersHash);
    });
});
