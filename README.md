# ethkit

Pure TypeScript Ethereum library. Drop-in replacement for the most-used parts of ethers.js.

No Proxy objects, no class inheritance, no dynamic imports, no native addons. Just functions.

## Install

```bash
npm install ethkit
```

Dependencies: `@noble/hashes`, `@noble/curves` (both pure TypeScript).

## Quick start

```typescript
import {
    createProvider, createWallet, Contract,
    parseEther, formatEther, Interface,
} from 'ethkit';

// Provider (HTTP JSON-RPC)
const provider = createProvider('https://rpc.example.com', 1);

// Wallet
const wallet = createWallet('0xYOUR_PRIVATE_KEY', provider);

// Send ETH
const tx = await wallet.sendTransaction({
    to: '0x...',
    value: parseEther('1.0'),
});
const receipt = await tx.wait();

// Contract interaction
const erc20 = Contract('0xTokenAddress', [
    'function balanceOf(address) view returns (uint256)',
    'function transfer(address, uint256) returns (bool)',
], provider);

const balance = await erc20.balanceOf('0x...');
console.log(formatEther(balance));
```

## What's included

| Module | Exports | ethers.js equivalent |
|--------|---------|---------------------|
| **Units** | `parseEther`, `formatEther`, `parseUnits`, `formatUnits` | `ethers.parseEther`, etc. |
| **ABI** | `encode`, `decode`, `encodeFunctionData`, `decodeFunctionResult`, `functionSelector`, `eventTopic` | `AbiCoder`, `Interface` |
| **Interface** | `new Interface(abi)` with `encodeFunctionData`, `decodeFunctionResult`, `parseTransaction`, `parseLog` | `ethers.Interface` |
| **Contract** | `Contract(address, abi, providerOrWallet)` | `new ethers.Contract(...)` |
| **Provider** | `createProvider(url, chainId)` with `call`, `send`, `getBlock`, `getBalance`, `getTransactionReceipt`, etc. | `ethers.JsonRpcProvider` |
| **Wallet** | `createWallet(key, provider)` with `signMessage`, `signTransaction`, `sendTransaction` | `ethers.Wallet` |
| **Transaction** | `serializeEip1559`, `serializeLegacy`, `transactionHash` | `ethers.Transaction` |
| **Hashing** | `keccak256`, `id`, `toUtf8Bytes`, `toUtf8String` | `ethers.keccak256`, `ethers.id` |
| **Address** | `getAddress`, `isAddress`, `computeAddress` | `ethers.getAddress`, etc. |
| **Utils** | `hexlify`, `zeroPadValue`, `dataSlice`, `concat`, `toQuantity`, `toBigInt`, `isHexString` | Various `ethers.*` utils |
| **Constants** | `ZeroAddress`, `ZeroHash`, `MaxUint256` | `ethers.ZeroAddress`, etc. |
| **RLP** | `rlpEncode` | `ethers.encodeRlp` |
| **AbiCoder** | `AbiCoder.defaultAbiCoder()` | `ethers.AbiCoder.defaultAbiCoder()` |

## Design choices

- **Functions, not classes.** `createProvider()` and `createWallet()` return plain objects. `Contract()` is a function call, not `new Contract()`.
- **HTTP only.** Provider uses `fetch()`. No WebSocket support (use a dedicated WS library if needed).
- **Native BigInt.** All numeric values are `bigint`. No `BigNumber` wrapper.
- **Throws on bad input.** `parseUnits('1.12345', 4)` throws (too many decimals) rather than silently truncating.
- **Minimal surface.** ~1,700 lines of source covering the most common Ethereum operations.

## ABI support

Supports both human-readable and JSON ABI formats:

```typescript
// Human-readable
const iface = new Interface([
    'function transfer(address to, uint256 amount) returns (bool)',
    'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

// JSON ABI
const iface2 = new Interface([
    { type: 'function', name: 'transfer', inputs: [...], outputs: [...] },
]);
```

Supported ABI types: `uint8`-`uint256`, `int8`-`int256`, `address`, `bool`, `bytes1`-`bytes32`, `bytes`, `string`, and dynamic arrays (`type[]`) of all the above. Tuples are not yet supported.

## Tests

Tests compare every function's output against ethers.js to ensure identical behavior:

```bash
npm test
```

159 tests across units, ABI, address, hashing, utils, transactions, and wallet signing.

## License

MIT
