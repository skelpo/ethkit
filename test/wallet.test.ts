import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as ethers from 'ethers';
import { createWallet } from '../src/wallet.js';

describe('Wallet', () => {
    const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

    it('derives correct address', () => {
        const ethersWallet = new ethers.Wallet(privateKey);
        const ourWallet = createWallet(privateKey);
        assert.equal(ourWallet.address, ethersWallet.address);
    });

    it('address matches for multiple keys', () => {
        const keys = [
            '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
            '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
            '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
        ];
        for (const key of keys) {
            const ethersWallet = new ethers.Wallet(key);
            const ourWallet = createWallet(key);
            assert.equal(ourWallet.address, ethersWallet.address);
        }
    });

    it('privateKey property has 0x prefix', () => {
        const wallet = createWallet(privateKey);
        assert.ok(wallet.privateKey.startsWith('0x'));
        assert.equal(wallet.privateKey.length, 66); // 0x + 64 hex chars
    });

    it('getAddress() matches address property', () => {
        const wallet = createWallet(privateKey);
        assert.equal(wallet.getAddress(), wallet.address);
    });

    it('signMessage matches ethers', async () => {
        const ethersWallet = new ethers.Wallet(privateKey);
        const ourWallet = createWallet(privateKey);

        const message = 'Hello, Ethereum!';
        const ethersSignature = await ethersWallet.signMessage(message);
        const ourSignature = await ourWallet.signMessage(message);

        assert.equal(ourSignature, ethersSignature);
    });

    it('signMessage with bytes matches ethers', async () => {
        const ethersWallet = new ethers.Wallet(privateKey);
        const ourWallet = createWallet(privateKey);

        const message = new Uint8Array([1, 2, 3, 4, 5]);
        const ethersSignature = await ethersWallet.signMessage(message);
        const ourSignature = await ourWallet.signMessage(message);

        assert.equal(ourSignature, ethersSignature);
    });

    it('signTransaction EIP-1559 matches ethers', async () => {
        const ethersWallet = new ethers.Wallet(privateKey);
        const ourWallet = createWallet(privateKey);

        const tx = {
            type: 2,
            chainId: 1,
            nonce: 0,
            maxPriorityFeePerGas: 1000000000n,
            maxFeePerGas: 30000000000n,
            gasLimit: 21000n,
            to: '0x0000000000000000000000000000000000000001',
            value: 1000000000000000000n,
        };

        const ethersSigned = await ethersWallet.signTransaction(tx);
        const ourSigned = await ourWallet.signTransaction(tx);
        assert.equal(ourSigned, ethersSigned);
    });

    it('signTransaction legacy matches ethers', async () => {
        const ethersWallet = new ethers.Wallet(privateKey);
        const ourWallet = createWallet(privateKey);

        const tx = {
            type: 0,
            chainId: 1,
            nonce: 42,
            gasPrice: 20000000000n,
            gasLimit: 21000n,
            to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
            value: 0n,
        };

        const ethersSigned = await ethersWallet.signTransaction(tx);
        const ourSigned = await ourWallet.signTransaction(tx);
        assert.equal(ourSigned, ethersSigned);
    });

    it('signTransaction with data matches ethers', async () => {
        const ethersWallet = new ethers.Wallet(privateKey);
        const ourWallet = createWallet(privateKey);

        const tx = {
            type: 2,
            chainId: 1,
            nonce: 1,
            maxPriorityFeePerGas: 2000000000n,
            maxFeePerGas: 50000000000n,
            gasLimit: 100000n,
            to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            value: 0n,
            data: '0xa9059cbb0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000003b9aca00',
        };

        const ethersSigned = await ethersWallet.signTransaction(tx);
        const ourSigned = await ourWallet.signTransaction(tx);
        assert.equal(ourSigned, ethersSigned);
    });

    it('connect creates new wallet with provider', () => {
        const wallet = createWallet(privateKey);
        assert.equal(wallet.provider, null);

        // Create a mock provider
        const mockProvider: any = { url: 'http://localhost:8545', chainId: 1 };
        const connected = wallet.connect(mockProvider);
        assert.equal(connected.provider, mockProvider);
        assert.equal(connected.address, wallet.address);
    });

    it('signTransaction on chain 56 (BNB)', async () => {
        const ethersWallet = new ethers.Wallet(privateKey);
        const ourWallet = createWallet(privateKey);

        const tx = {
            type: 0,
            chainId: 56,
            nonce: 0,
            gasPrice: 5000000000n,
            gasLimit: 21000n,
            to: '0x0000000000000000000000000000000000000001',
            value: 100000000000000000n,
        };

        const ethersSigned = await ethersWallet.signTransaction(tx);
        const ourSigned = await ourWallet.signTransaction(tx);
        assert.equal(ourSigned, ethersSigned);
    });
});
