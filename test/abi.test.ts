import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as ethers from 'ethers';
import { encode, decode, encodeFunctionData, decodeFunctionResult, functionSelector, eventTopic } from '../src/abi.js';
import { AbiCoder } from '../src/abi-coder.js';
import { Interface } from '../src/interface.js';

const coder = ethers.AbiCoder.defaultAbiCoder();

describe('ABI encode', () => {
    it('single uint256', () => {
        assert.equal(encode(['uint256'], [42n]), coder.encode(['uint256'], [42n]));
    });

    it('single address', () => {
        const addr = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
        assert.equal(encode(['address'], [addr]), coder.encode(['address'], [addr]));
    });

    it('bool true/false', () => {
        assert.equal(encode(['bool'], [true]), coder.encode(['bool'], [true]));
        assert.equal(encode(['bool'], [false]), coder.encode(['bool'], [false]));
    });

    it('multiple static types', () => {
        const types = ['address', 'uint256', 'bool'];
        const values = ['0x0000000000000000000000000000000000000001', 100n, true];
        assert.equal(encode(types, values), coder.encode(types, values));
    });

    it('int256 negative', () => {
        assert.equal(encode(['int256'], [-1n]), coder.encode(['int256'], [-1n]));
        assert.equal(encode(['int256'], [-100n]), coder.encode(['int256'], [-100n]));
    });

    it('int24 negative', () => {
        assert.equal(encode(['int24'], [-887272n]), coder.encode(['int24'], [-887272n]));
    });

    it('bytes32', () => {
        const val = '0x' + 'ab'.repeat(32);
        assert.equal(encode(['bytes32'], [val]), coder.encode(['bytes32'], [val]));
    });

    it('bytes4', () => {
        const val = '0xdeadbeef';
        assert.equal(encode(['bytes4'], [val]), coder.encode(['bytes4'], [val]));
    });

    it('dynamic string', () => {
        assert.equal(encode(['string'], ['hello']), coder.encode(['string'], ['hello']));
    });

    it('dynamic bytes', () => {
        assert.equal(encode(['bytes'], ['0xdeadbeef']), coder.encode(['bytes'], ['0xdeadbeef']));
    });

    it('uint256 array', () => {
        assert.equal(
            encode(['uint256[]'], [[1n, 2n, 3n]]),
            coder.encode(['uint256[]'], [[1n, 2n, 3n]])
        );
    });

    it('address array', () => {
        const addrs = [
            '0x0000000000000000000000000000000000000001',
            '0x0000000000000000000000000000000000000002',
        ];
        assert.equal(encode(['address[]'], [addrs]), coder.encode(['address[]'], [addrs]));
    });

    it('mixed static + dynamic', () => {
        const types = ['uint256', 'string', 'address'];
        const values = [42n, 'hello', '0x0000000000000000000000000000000000000001'];
        assert.equal(encode(types, values), coder.encode(types, values));
    });

    it('string array', () => {
        const strings = ['hello', 'world'];
        assert.equal(encode(['string[]'], [strings]), coder.encode(['string[]'], [strings]));
    });

    it('uint128', () => {
        assert.equal(encode(['uint128'], [340282366920938463463374607431768211455n]),
            coder.encode(['uint128'], [340282366920938463463374607431768211455n]));
    });

    it('empty string', () => {
        assert.equal(encode(['string'], ['']), coder.encode(['string'], ['']));
    });

    it('empty bytes', () => {
        assert.equal(encode(['bytes'], ['0x']), coder.encode(['bytes'], ['0x']));
    });

    it('empty array', () => {
        assert.equal(encode(['uint256[]'], [[]]), coder.encode(['uint256[]'], [[]]));
    });
});

describe('ABI decode', () => {
    it('single uint256', () => {
        const encoded = coder.encode(['uint256'], [42n]);
        const result = decode(['uint256'], encoded);
        assert.equal(result[0], 42n);
    });

    it('single address', () => {
        const addr = '0x0000000000000000000000000000000000000001';
        const encoded = coder.encode(['address'], [addr]);
        const result = decode(['address'], encoded);
        assert.equal(result[0], addr);
    });

    it('int256 negative', () => {
        const encoded = coder.encode(['int256'], [-1n]);
        const result = decode(['int256'], encoded);
        assert.equal(result[0], -1n);
    });

    it('int24 negative', () => {
        const encoded = coder.encode(['int24'], [-887272n]);
        const result = decode(['int24'], encoded);
        assert.equal(result[0], -887272n);
    });

    it('string', () => {
        const encoded = coder.encode(['string'], ['hello world']);
        const result = decode(['string'], encoded);
        assert.equal(result[0], 'hello world');
    });

    it('bytes', () => {
        const encoded = coder.encode(['bytes'], ['0xdeadbeef']);
        const result = decode(['bytes'], encoded);
        assert.equal(result[0], '0xdeadbeef');
    });

    it('uint256 array', () => {
        const encoded = coder.encode(['uint256[]'], [[1n, 2n, 3n]]);
        const result = decode(['uint256[]'], encoded);
        assert.deepEqual(result[0], [1n, 2n, 3n]);
    });

    it('mixed types roundtrip', () => {
        const types = ['uint256', 'string', 'address', 'bool'];
        const values = [999n, 'test', '0x0000000000000000000000000000000000000001', true];
        const encoded = encode(types, values);
        const decoded = decode(types, encoded);
        assert.equal(decoded[0], 999n);
        assert.equal(decoded[1], 'test');
        assert.equal(decoded[2], '0x0000000000000000000000000000000000000001');
        assert.equal(decoded[3], true);
    });

    it('bool decode', () => {
        const encoded = coder.encode(['bool'], [true]);
        assert.equal(decode(['bool'], encoded)[0], true);
        const encoded2 = coder.encode(['bool'], [false]);
        assert.equal(decode(['bool'], encoded2)[0], false);
    });
});

describe('functionSelector', () => {
    const sigs = [
        'transfer(address,uint256)',
        'balanceOf(address)',
        'approve(address,uint256)',
        'swap(address,bool,int256,uint160,bytes)',
        'getReserves()',
    ];
    for (const sig of sigs) {
        it(`functionSelector("${sig}")`, () => {
            const iface = new ethers.Interface([`function ${sig}`]);
            const expected = iface.getFunction(sig.split('(')[0])!.selector;
            assert.equal(functionSelector(sig), expected);
        });
    }
});

describe('eventTopic', () => {
    const events = [
        'Transfer(address,address,uint256)',
        'Approval(address,address,uint256)',
        'Swap(address,uint256,uint256,uint256,uint256,address)',
    ];
    for (const ev of events) {
        it(`eventTopic("${ev}")`, () => {
            const iface = new ethers.Interface([`event ${ev}`]);
            const name = ev.split('(')[0];
            const expected = iface.getEvent(name)!.topicHash;
            assert.equal(eventTopic(ev), expected);
        });
    }
});

describe('encodeFunctionData', () => {
    it('transfer(address,uint256)', () => {
        const iface = new ethers.Interface(['function transfer(address to, uint256 amount)']);
        const addr = '0x0000000000000000000000000000000000000001';
        const expected = iface.encodeFunctionData('transfer', [addr, 100n]);
        assert.equal(encodeFunctionData('transfer(address,uint256)', [addr, 100n]), expected);
    });

    it('balanceOf(address)', () => {
        const iface = new ethers.Interface(['function balanceOf(address owner) view returns (uint256)']);
        const addr = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
        const expected = iface.encodeFunctionData('balanceOf', [addr]);
        assert.equal(encodeFunctionData('balanceOf(address)', [addr]), expected);
    });

    it('no arguments', () => {
        const iface = new ethers.Interface(['function getReserves() view returns (uint112, uint112, uint32)']);
        const expected = iface.encodeFunctionData('getReserves', []);
        assert.equal(encodeFunctionData('getReserves()', []), expected);
    });
});

describe('decodeFunctionResult', () => {
    it('balanceOf returns uint256', () => {
        const iface = new ethers.Interface(['function balanceOf(address) view returns (uint256)']);
        const encoded = coder.encode(['uint256'], [12345n]);
        const result = decodeFunctionResult('balanceOf(address) returns (uint256)', encoded);
        assert.equal(result[0], 12345n);
    });

    it('getReserves returns multiple values', () => {
        const encoded = coder.encode(['uint112', 'uint112', 'uint32'], [1000n, 2000n, 1234n]);
        const result = decodeFunctionResult('getReserves() returns (uint112,uint112,uint32)', encoded);
        assert.equal(result[0], 1000n);
        assert.equal(result[1], 2000n);
        assert.equal(result[2], 1234n);
    });
});

describe('AbiCoder compat', () => {
    it('defaultAbiCoder().encode matches ethers', () => {
        const ourResult = AbiCoder.defaultAbiCoder().encode(['uint256', 'address'], [42n, '0x0000000000000000000000000000000000000001']);
        const ethersResult = coder.encode(['uint256', 'address'], [42n, '0x0000000000000000000000000000000000000001']);
        assert.equal(ourResult, ethersResult);
    });

    it('defaultAbiCoder().decode matches ethers', () => {
        const data = coder.encode(['uint256', 'bool'], [999n, true]);
        const result = AbiCoder.defaultAbiCoder().decode(['uint256', 'bool'], data);
        assert.equal(result[0], 999n);
        assert.equal(result[1], true);
    });
});

describe('Interface', () => {
    const abi = [
        'function transfer(address to, uint256 amount) returns (bool)',
        'function balanceOf(address owner) view returns (uint256)',
        'event Transfer(address indexed from, address indexed to, uint256 value)',
    ];
    const ethersIface = new ethers.Interface(abi);
    const ourIface = new Interface(abi);

    it('encodeFunctionData matches', () => {
        const addr = '0x0000000000000000000000000000000000000001';
        assert.equal(
            ourIface.encodeFunctionData('transfer', [addr, 100n]),
            ethersIface.encodeFunctionData('transfer', [addr, 100n])
        );
    });

    it('encodeFunctionData balanceOf matches', () => {
        const addr = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
        assert.equal(
            ourIface.encodeFunctionData('balanceOf', [addr]),
            ethersIface.encodeFunctionData('balanceOf', [addr])
        );
    });

    it('decodeFunctionResult matches', () => {
        const encoded = coder.encode(['uint256'], [42n]);
        const ourResult = ourIface.decodeFunctionResult('balanceOf', encoded);
        const ethersResult = ethersIface.decodeFunctionResult('balanceOf', encoded);
        assert.equal(ourResult[0], ethersResult[0]);
    });

    it('parseTransaction matches', () => {
        const addr = '0x0000000000000000000000000000000000000001';
        const data = ethersIface.encodeFunctionData('transfer', [addr, 100n]);
        const ourResult = ourIface.parseTransaction({ data });
        const ethersResult = ethersIface.parseTransaction({ data });
        assert.equal(ourResult!.name, ethersResult!.name);
        assert.equal(ourResult!.selector, ethersResult!.selector);
    });

    it('parseLog matches', () => {
        // Create a Transfer event log
        const topic0 = ethersIface.getEvent('Transfer')!.topicHash;
        const from = '0x' + '00'.repeat(12) + 'd8da6bf26964af9d7eed9e03e53415d37aa96045';
        const to = '0x' + '00'.repeat(12) + '0000000000000000000000000000000000000001';
        const data = coder.encode(['uint256'], [1000n]);

        const ourResult = ourIface.parseLog({ topics: [topic0, from, to], data });
        assert.ok(ourResult);
        assert.equal(ourResult!.name, 'Transfer');
    });

    it('JSON ABI works', () => {
        const jsonAbi = [
            { type: 'function', name: 'transfer', inputs: [{ type: 'address', name: 'to' }, { type: 'uint256', name: 'amount' }], outputs: [{ type: 'bool', name: '' }], stateMutability: 'nonpayable' },
        ];
        const iface = new Interface(jsonAbi);
        const ethIface = new ethers.Interface(jsonAbi);
        const addr = '0x0000000000000000000000000000000000000001';
        assert.equal(
            iface.encodeFunctionData('transfer', [addr, 50n]),
            ethIface.encodeFunctionData('transfer', [addr, 50n])
        );
    });
});
