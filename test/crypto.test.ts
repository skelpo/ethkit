import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { keccak256 as ourKeccak } from '../src/crypto/keccak.js';
import { sha256 as ourSha256 } from '../src/crypto/sha256.js';
import { hmacSha256 as ourHmac } from '../src/crypto/hmac.js';
import { sign as ourSign, getPublicKey as ourGetPublicKey, verify as ourVerify, recoverPublicKey as ourRecoverPublicKey } from '../src/crypto/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';

function hexToBytes(hex: string): Uint8Array {
    if (hex.startsWith('0x')) hex = hex.slice(2);
    if (hex.length % 2 !== 0) hex = '0' + hex;
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
}

function randomBytes(n: number): Uint8Array {
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
    }
    return bytes;
}

// ======== KECCAK-256 ========

describe('keccak256', () => {
    it('empty input', () => {
        const input = new Uint8Array(0);
        const expected = bytesToHex(keccak_256(input));
        const actual = bytesToHex(ourKeccak(input));
        assert.strictEqual(actual, expected);
    });

    it('short string "hello"', () => {
        const input = new TextEncoder().encode('hello');
        const expected = bytesToHex(keccak_256(input));
        const actual = bytesToHex(ourKeccak(input));
        assert.strictEqual(actual, expected);
    });

    it('known test vector: empty string', () => {
        // keccak256("") = c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470
        const actual = bytesToHex(ourKeccak(new Uint8Array(0)));
        assert.strictEqual(actual, 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
    });

    it('known test vector: "abc"', () => {
        const input = new TextEncoder().encode('abc');
        const actual = bytesToHex(ourKeccak(input));
        const expected = bytesToHex(keccak_256(input));
        assert.strictEqual(actual, expected);
    });

    it('EVM function selector: Transfer(address,address,uint256)', () => {
        const input = new TextEncoder().encode('Transfer(address,address,uint256)');
        const expected = bytesToHex(keccak_256(input));
        const actual = bytesToHex(ourKeccak(input));
        assert.strictEqual(actual, expected);
    });

    it('exactly 136 bytes (one full keccak block)', () => {
        const input = new Uint8Array(136);
        for (let i = 0; i < 136; i++) input[i] = i & 0xFF;
        const expected = bytesToHex(keccak_256(input));
        const actual = bytesToHex(ourKeccak(input));
        assert.strictEqual(actual, expected);
    });

    it('137 bytes (one block + 1)', () => {
        const input = new Uint8Array(137);
        for (let i = 0; i < 137; i++) input[i] = (i * 7) & 0xFF;
        const expected = bytesToHex(keccak_256(input));
        const actual = bytesToHex(ourKeccak(input));
        assert.strictEqual(actual, expected);
    });

    it('272 bytes (two full keccak blocks)', () => {
        const input = new Uint8Array(272);
        for (let i = 0; i < 272; i++) input[i] = (i * 13) & 0xFF;
        const expected = bytesToHex(keccak_256(input));
        const actual = bytesToHex(ourKeccak(input));
        assert.strictEqual(actual, expected);
    });

    it('1000 random bytes', () => {
        const input = randomBytes(1000);
        const expected = bytesToHex(keccak_256(input));
        const actual = bytesToHex(ourKeccak(input));
        assert.strictEqual(actual, expected);
    });

    it('100 random inputs', () => {
        for (let i = 0; i < 100; i++) {
            const len = Math.floor(Math.random() * 500);
            const input = randomBytes(len);
            const expected = bytesToHex(keccak_256(input));
            const actual = bytesToHex(ourKeccak(input));
            assert.strictEqual(actual, expected, `Failed for random input of length ${len}`);
        }
    });

    it('single byte inputs 0-255', () => {
        for (let b = 0; b < 256; b++) {
            const input = new Uint8Array([b]);
            const expected = bytesToHex(keccak_256(input));
            const actual = bytesToHex(ourKeccak(input));
            assert.strictEqual(actual, expected, `Failed for byte ${b}`);
        }
    });

    it('Solidity abi.encodePacked style data', () => {
        // address + uint256 packed encoding
        const input = hexToBytes('0000000000000000000000006b175474e89094c44da98b954eedeac495271d0f0000000000000000000000000000000000000000000000000de0b6b3a7640000');
        const expected = bytesToHex(keccak_256(input));
        const actual = bytesToHex(ourKeccak(input));
        assert.strictEqual(actual, expected);
    });
});

// ======== SHA-256 ========

describe('sha256', () => {
    it('empty input', () => {
        const input = new Uint8Array(0);
        const expected = bytesToHex(nobleSha256(input));
        const actual = bytesToHex(ourSha256(input));
        assert.strictEqual(actual, expected);
    });

    it('known vector: empty', () => {
        const actual = bytesToHex(ourSha256(new Uint8Array(0)));
        assert.strictEqual(actual, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('known vector: "abc"', () => {
        const input = new TextEncoder().encode('abc');
        const actual = bytesToHex(ourSha256(input));
        assert.strictEqual(actual, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });

    it('"hello"', () => {
        const input = new TextEncoder().encode('hello');
        const expected = bytesToHex(nobleSha256(input));
        const actual = bytesToHex(ourSha256(input));
        assert.strictEqual(actual, expected);
    });

    it('64 bytes (one block)', () => {
        const input = new Uint8Array(64);
        for (let i = 0; i < 64; i++) input[i] = i;
        const expected = bytesToHex(nobleSha256(input));
        const actual = bytesToHex(ourSha256(input));
        assert.strictEqual(actual, expected);
    });

    it('100 random inputs', () => {
        for (let i = 0; i < 100; i++) {
            const len = Math.floor(Math.random() * 500);
            const input = randomBytes(len);
            const expected = bytesToHex(nobleSha256(input));
            const actual = bytesToHex(ourSha256(input));
            assert.strictEqual(actual, expected, `Failed for length ${len}`);
        }
    });
});

// ======== HMAC-SHA256 ========

describe('hmac-sha256', () => {
    it('known vector: RFC 4231 test case 1', () => {
        // Key = 0x0b repeated 20 times, Data = "Hi There"
        const key = new Uint8Array(20);
        for (let i = 0; i < 20; i++) key[i] = 0x0b;
        const data = new TextEncoder().encode('Hi There');
        const expected = 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7';
        const actual = bytesToHex(ourHmac(key, data));
        assert.strictEqual(actual, expected);
    });

    it('matches noble for short key', () => {
        const key = new TextEncoder().encode('secret');
        const data = new TextEncoder().encode('message');
        const expected = bytesToHex(hmac(nobleSha256, key, data));
        const actual = bytesToHex(ourHmac(key, data));
        assert.strictEqual(actual, expected);
    });

    it('matches noble for long key (>64 bytes)', () => {
        const key = randomBytes(100);
        const data = randomBytes(50);
        const expected = bytesToHex(hmac(nobleSha256, key, data));
        const actual = bytesToHex(ourHmac(key, data));
        assert.strictEqual(actual, expected);
    });

    it('50 random key/data pairs', () => {
        for (let i = 0; i < 50; i++) {
            const key = randomBytes(Math.floor(Math.random() * 128) + 1);
            const data = randomBytes(Math.floor(Math.random() * 200));
            const expected = bytesToHex(hmac(nobleSha256, key, data));
            const actual = bytesToHex(ourHmac(key, data));
            assert.strictEqual(actual, expected, `Failed for key len ${key.length}, data len ${data.length}`);
        }
    });
});

// ======== SECP256K1 ========

describe('secp256k1', () => {
    // Known private key for deterministic tests
    const testPrivKey = hexToBytes('4c0883a69102937d6231471b5dbb6204fe512961708279f7f57a5f1e12c9d0b6');

    it('getPublicKey matches noble (uncompressed)', () => {
        const expected = secp256k1.getPublicKey(testPrivKey, false);
        const actual = ourGetPublicKey(testPrivKey, false);
        assert.strictEqual(bytesToHex(actual), bytesToHex(expected));
    });

    it('getPublicKey matches noble (compressed)', () => {
        const expected = secp256k1.getPublicKey(testPrivKey, true);
        const actual = ourGetPublicKey(testPrivKey, true);
        assert.strictEqual(bytesToHex(actual), bytesToHex(expected));
    });

    it('sign matches noble (deterministic RFC 6979)', () => {
        const msgHash = hexToBytes('9c22ff5f21f0b81b113e63f7db6da94fedef11b2119b4088b89664fb9a3cb658');
        // noble v2 default prehash=true (sha256 the input), we need prehash=false for raw hash
        const nobleSigBytes = secp256k1.sign(msgHash, testPrivKey, { prehash: false });
        const nobleR = BigInt('0x' + bytesToHex(nobleSigBytes.slice(0, 32)));
        const nobleS = BigInt('0x' + bytesToHex(nobleSigBytes.slice(32, 64)));
        const ourSig = ourSign(msgHash, testPrivKey);

        assert.strictEqual(ourSig.r.toString(16), nobleR.toString(16), 'r mismatch');
        assert.strictEqual(ourSig.s.toString(16), nobleS.toString(16), 's mismatch');
    });

    it('sign + verify roundtrip', () => {
        const msgHash = hexToBytes('deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
        const pubKey = ourGetPublicKey(testPrivKey, false);
        const sig = ourSign(msgHash, testPrivKey);
        const valid = ourVerify(msgHash, sig, pubKey);
        assert.strictEqual(valid, true);
    });

    it('verify rejects tampered message', () => {
        const msgHash = hexToBytes('deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
        const pubKey = ourGetPublicKey(testPrivKey, false);
        const sig = ourSign(msgHash, testPrivKey);
        const tampered = hexToBytes('deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbee0');
        const valid = ourVerify(tampered, sig, pubKey);
        assert.strictEqual(valid, false);
    });

    it('recoverPublicKey matches noble', () => {
        const msgHash = hexToBytes('9c22ff5f21f0b81b113e63f7db6da94fedef11b2119b4088b89664fb9a3cb658');
        const sig = ourSign(msgHash, testPrivKey);
        const recovered = ourRecoverPublicKey(msgHash, sig, sig.recovery);
        const expected = ourGetPublicKey(testPrivKey, false);
        assert.strictEqual(bytesToHex(recovered), bytesToHex(expected));
    });

    it('10 random private keys: sign matches noble', () => {
        for (let i = 0; i < 10; i++) {
            let privKey: Uint8Array;
            // Ensure valid private key (< N)
            while (true) {
                privKey = randomBytes(32);
                const k = BigInt('0x' + bytesToHex(privKey));
                const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
                if (k > 0n && k < N) break;
            }
            const msgHash = randomBytes(32);

            const nobleSigBytes = secp256k1.sign(msgHash, privKey, { prehash: false });
            const nobleR = BigInt('0x' + bytesToHex(nobleSigBytes.slice(0, 32)));
            const nobleS = BigInt('0x' + bytesToHex(nobleSigBytes.slice(32, 64)));
            const ourSig = ourSign(msgHash, privKey);

            assert.strictEqual(ourSig.r.toString(16), nobleR.toString(16), `r mismatch for key ${i}`);
            assert.strictEqual(ourSig.s.toString(16), nobleS.toString(16), `s mismatch for key ${i}`);
        }
    });

    it('getPublicKey for 10 random keys matches noble', () => {
        for (let i = 0; i < 10; i++) {
            let privKey: Uint8Array;
            while (true) {
                privKey = randomBytes(32);
                const k = BigInt('0x' + bytesToHex(privKey));
                const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
                if (k > 0n && k < N) break;
            }
            const expected = secp256k1.getPublicKey(privKey, false);
            const actual = ourGetPublicKey(privKey, false);
            assert.strictEqual(bytesToHex(actual), bytesToHex(expected), `Mismatch for key ${i}`);
        }
    });

    it('verify with compressed public key', () => {
        const msgHash = hexToBytes('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
        const pubKey = ourGetPublicKey(testPrivKey, true);
        const sig = ourSign(msgHash, testPrivKey);
        const valid = ourVerify(msgHash, sig, pubKey);
        assert.strictEqual(valid, true);
    });

    it('Ethereum transaction signing: keccak hash + sign + recover', () => {
        // Simulate Ethereum tx signing
        const txData = new TextEncoder().encode('test transaction data');
        const txHash = ourKeccak(txData);
        const sig = ourSign(txHash, testPrivKey);
        const recovered = ourRecoverPublicKey(txHash, sig, sig.recovery);
        const expected = ourGetPublicKey(testPrivKey, false);
        assert.strictEqual(bytesToHex(recovered), bytesToHex(expected));
    });
});

// ======== PERFORMANCE ========

describe('performance', () => {
    it('keccak256: 10000 hashes', () => {
        const input = randomBytes(32);
        const start = performance.now();
        for (let i = 0; i < 10000; i++) {
            ourKeccak(input);
        }
        const ourTime = performance.now() - start;

        const start2 = performance.now();
        for (let i = 0; i < 10000; i++) {
            keccak_256(input);
        }
        const nobleTime = performance.now() - start2;

        console.log(`  keccak256 10k: ours=${ourTime.toFixed(1)}ms, noble=${nobleTime.toFixed(1)}ms, ratio=${(ourTime/nobleTime).toFixed(2)}x`);
    });

    it('sha256: 10000 hashes', () => {
        const input = randomBytes(32);
        const start = performance.now();
        for (let i = 0; i < 10000; i++) {
            ourSha256(input);
        }
        const ourTime = performance.now() - start;

        const start2 = performance.now();
        for (let i = 0; i < 10000; i++) {
            nobleSha256(input);
        }
        const nobleTime = performance.now() - start2;

        console.log(`  sha256 10k: ours=${ourTime.toFixed(1)}ms, noble=${nobleTime.toFixed(1)}ms, ratio=${(ourTime/nobleTime).toFixed(2)}x`);
    });

    it('secp256k1 sign: 10 signatures', () => {
        const privKey = hexToBytes('4c0883a69102937d6231471b5dbb6204fe512961708279f7f57a5f1e12c9d0b6');
        const msgHash = randomBytes(32);
        const start = performance.now();
        for (let i = 0; i < 10; i++) {
            ourSign(msgHash, privKey);
        }
        const ourTime = performance.now() - start;

        const start2 = performance.now();
        for (let i = 0; i < 10; i++) {
            secp256k1.sign(msgHash, privKey);
        }
        const nobleTime = performance.now() - start2;

        console.log(`  secp256k1 sign 10: ours=${ourTime.toFixed(1)}ms, noble=${nobleTime.toFixed(1)}ms, ratio=${(ourTime/nobleTime).toFixed(2)}x`);
    });
});
