import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as ethers from 'ethers';
import {
    ZeroAddress, ZeroHash, MaxUint256,
    toQuantity, isHexString, hexlify, toBigInt,
    zeroPadValue, dataSlice, dataLength, concat, stripZerosLeft,
} from '../src/utils.js';

describe('constants', () => {
    it('ZeroAddress', () => {
        assert.equal(ZeroAddress, ethers.ZeroAddress);
    });

    it('ZeroHash', () => {
        assert.equal(ZeroHash, ethers.ZeroHash);
    });

    it('MaxUint256', () => {
        assert.equal(MaxUint256, ethers.MaxUint256);
    });
});

describe('toQuantity', () => {
    it('number input', () => {
        assert.equal(toQuantity(0), ethers.toQuantity(0));
        assert.equal(toQuantity(1), ethers.toQuantity(1));
        assert.equal(toQuantity(255), ethers.toQuantity(255));
        assert.equal(toQuantity(256), ethers.toQuantity(256));
    });

    it('bigint input', () => {
        assert.equal(toQuantity(0n), ethers.toQuantity(0n));
        assert.equal(toQuantity(1000n), ethers.toQuantity(1000n));
    });
});

describe('isHexString', () => {
    it('valid hex strings', () => {
        assert.equal(isHexString('0x'), ethers.isHexString('0x'));
        assert.equal(isHexString('0x1234'), ethers.isHexString('0x1234'));
        assert.equal(isHexString('0xdeadbeef'), ethers.isHexString('0xdeadbeef'));
    });

    it('invalid hex strings', () => {
        assert.equal(isHexString('hello'), ethers.isHexString('hello'));
        assert.equal(isHexString('0xGG'), ethers.isHexString('0xGG'));
        assert.equal(isHexString(42), ethers.isHexString(42));
    });

    it('with length', () => {
        assert.equal(isHexString('0x1234', 2), ethers.isHexString('0x1234', 2));
        assert.equal(isHexString('0x1234', 3), ethers.isHexString('0x1234', 3));
        assert.equal(isHexString('0x' + '00'.repeat(20), 20), ethers.isHexString('0x' + '00'.repeat(20), 20));
    });
});

describe('hexlify', () => {
    it('Uint8Array', () => {
        const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
        assert.equal(hexlify(bytes), ethers.hexlify(bytes));
    });

    it('empty Uint8Array', () => {
        assert.equal(hexlify(new Uint8Array(0)), ethers.hexlify(new Uint8Array(0)));
    });
});

describe('toBigInt', () => {
    it('from number', () => {
        assert.equal(toBigInt(42), ethers.toBigInt(42));
    });

    it('from hex string', () => {
        assert.equal(toBigInt('0xff'), ethers.toBigInt('0xff'));
    });

    it('from bigint', () => {
        assert.equal(toBigInt(123n), ethers.toBigInt(123n));
    });
});

describe('zeroPadValue', () => {
    it('pads short values', () => {
        assert.equal(zeroPadValue('0x1234', 32), ethers.zeroPadValue('0x1234', 32));
    });

    it('pads address to 32 bytes', () => {
        const addr = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
        assert.equal(zeroPadValue(addr, 32), ethers.zeroPadValue(addr, 32));
    });
});

describe('dataSlice', () => {
    const data = '0xdeadbeef01020304';
    it('slice from offset', () => {
        assert.equal(dataSlice(data, 0, 4), ethers.dataSlice(data, 0, 4));
    });

    it('slice middle', () => {
        assert.equal(dataSlice(data, 2, 6), ethers.dataSlice(data, 2, 6));
    });

    it('slice to end', () => {
        assert.equal(dataSlice(data, 4), ethers.dataSlice(data, 4));
    });
});

describe('dataLength', () => {
    it('counts bytes', () => {
        assert.equal(dataLength('0xdeadbeef'), ethers.dataLength('0xdeadbeef'));
        assert.equal(dataLength('0x'), ethers.dataLength('0x'));
        assert.equal(dataLength('0x00'), ethers.dataLength('0x00'));
    });
});

describe('concat', () => {
    it('concatenates hex strings', () => {
        const a = '0xdead';
        const b = '0xbeef';
        assert.equal(concat([a, b]), ethers.concat([a, b]));
    });

    it('empty array', () => {
        assert.equal(concat([]), ethers.concat([]));
    });

    it('single element', () => {
        assert.equal(concat(['0x1234']), ethers.concat(['0x1234']));
    });
});
