# CLAUDE.md

## Project overview

ethkit is a pure TypeScript Ethereum library — a lightweight, function-based replacement for ethers.js.
No Proxy objects, no class inheritance, no dynamic imports, no native addons.
Compatible with [Perry](https://perryts.com) (TypeScript-to-native compiler).

## Build & test

```bash
npm install          # install dependencies
npm test             # run all 159 comparison tests (vs ethers.js)
```

Tests use Node.js built-in test runner (`node:test`) with `tsx`. Each test compares ethkit output against ethers.js for the same inputs.

## Architecture

All source is in `src/`, tests in `test/`. No build step needed — consumed directly as TypeScript via `tsx` or bundlers.

| File | Purpose |
|------|---------|
| `src/index.ts` | Public API — re-exports everything |
| `src/abi.ts` | ABI encode/decode, function selectors, event topics |
| `src/abi-coder.ts` | `AbiCoder.defaultAbiCoder()` compat shim |
| `src/interface.ts` | `Interface` class (encodeFunctionData, decodeFunctionResult, parseTransaction, parseLog) |
| `src/contract.ts` | `Contract()` function, `contractCall`, `contractSend`, `createContractReader` |
| `src/provider.ts` | HTTP JSON-RPC provider via `fetch()` |
| `src/wallet.ts` | Wallet: signing (secp256k1 via @noble/curves), sendTransaction with receipt polling |
| `src/transaction.ts` | EIP-1559 and legacy transaction serialization + signing hash |
| `src/rlp.ts` | RLP encoding |
| `src/hash.ts` | keccak256, id, toUtf8Bytes/toUtf8String, hex/bytes conversion |
| `src/address.ts` | EIP-55 checksum, isAddress, computeAddress from public key |
| `src/units.ts` | parseEther, formatEther, parseUnits, formatUnits |
| `src/utils.ts` | Constants (ZeroAddress, ZeroHash, MaxUint256) and hex utilities |
| `src/types.ts` | TypeScript interfaces (Block, TransactionReceipt, Log, etc.) |

## Key design decisions

- **Functions over classes.** `createProvider()`, `createWallet()`, `Contract()` return plain objects.
- **Native BigInt only.** No BigNumber wrappers.
- **Two runtime dependencies:** `@noble/hashes` (keccak256, sha256) and `@noble/curves` (secp256k1 signing). Both are pure TypeScript.
- **ethers.js is a devDependency only** — used in tests as the reference implementation.
- **No WebSocket.** Provider is HTTP-only (`fetch`).
- **formatUnits always includes a decimal** — `formatUnits(1000000n, 6)` returns `"1.0"`, matching ethers.js behavior.
- **parseUnits throws on excess decimals** — `parseUnits("1.12345", 4)` throws rather than truncating.

## ABI types supported

`uint8`-`uint256`, `int8`-`int256`, `address`, `bool`, `bytes1`-`bytes32`, `bytes`, `string`, dynamic arrays (`type[]`). Tuples not yet supported.

## Code style

- ES Modules (`"type": "module"`)
- Target: ES2021
- camelCase naming
- No dynamic imports — all imports are static top-level
