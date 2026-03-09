const RC_HI: number[] = [
    0x00000000, 0x00000000, 0x80000000, 0x80000000,
    0x00000000, 0x00000000, 0x80000000, 0x80000000,
    0x00000000, 0x00000000, 0x00000000, 0x00000000,
    0x00000000, 0x80000000, 0x80000000, 0x80000000,
    0x80000000, 0x80000000, 0x00000000, 0x80000000,
    0x80000000, 0x80000000, 0x00000000, 0x80000000,
];

const RC_LO: number[] = [
    0x00000001, 0x00008082, 0x0000808A, 0x80008000,
    0x0000808B, 0x80000001, 0x80008081, 0x00008009,
    0x0000008A, 0x00000088, 0x80008009, 0x8000000A,
    0x8000808B, 0x0000008B, 0x00008089, 0x00008003,
    0x00008002, 0x00000080, 0x0000800A, 0x8000000A,
    0x80008081, 0x00008080, 0x80000001, 0x80008008,
];

const ROT: number[] = [
    0, 1, 62, 28, 27,
    36, 44, 6, 55, 20,
    3, 10, 43, 25, 39,
    41, 45, 15, 21, 8,
    18, 2, 61, 56, 14,
];

const PI: number[] = [
    0, 10, 20, 5, 15,
    16, 1, 11, 21, 6,
    7, 17, 2, 12, 22,
    23, 8, 18, 3, 13,
    14, 24, 9, 19, 4,
];

// Use & M for 32-bit truncation (Perry's >>> 0 and | 0 fail inside functions)
const M = 0xFFFFFFFF;

function keccakF(stateHi: number[], stateLo: number[]): void {
    const cHi = new Array<number>(5);
    const cLo = new Array<number>(5);
    const dHi = new Array<number>(5);
    const dLo = new Array<number>(5);
    const bHi = new Array<number>(25);
    const bLo = new Array<number>(25);

    for (let round = 0; round < 24; round++) {
        // Theta: column parity
        for (let x = 0; x < 5; x++) {
            cHi[x] = (stateHi[x] ^ stateHi[x + 5] ^ stateHi[x + 10] ^ stateHi[x + 15] ^ stateHi[x + 20]) & M;
            cLo[x] = (stateLo[x] ^ stateLo[x + 5] ^ stateLo[x + 10] ^ stateLo[x + 15] ^ stateLo[x + 20]) & M;
        }

        for (let x = 0; x < 5; x++) {
            const x4 = (x + 4) % 5;
            const x1 = (x + 1) % 5;
            const rotHi = (((cHi[x1] << 1) & M) | (cLo[x1] >>> 31)) & M;
            const rotLo = (((cLo[x1] << 1) & M) | (cHi[x1] >>> 31)) & M;
            dHi[x] = (cHi[x4] ^ rotHi) & M;
            dLo[x] = (cLo[x4] ^ rotLo) & M;
        }

        for (let i = 0; i < 25; i++) {
            stateHi[i] = (stateHi[i] ^ dHi[i % 5]) & M;
            stateLo[i] = (stateLo[i] ^ dLo[i % 5]) & M;
        }

        // Rho + Pi
        for (let i = 0; i < 25; i++) {
            const r = ROT[i];
            const sh = stateHi[i];
            const sl = stateLo[i];
            let rh: number;
            let rl: number;
            if (r === 0) {
                rh = sh;
                rl = sl;
            } else if (r < 32) {
                rh = (((sh << r) & M) | (sl >>> (32 - r))) & M;
                rl = (((sl << r) & M) | (sh >>> (32 - r))) & M;
            } else {
                const m = r - 32;
                rh = (((sl << m) & M) | (sh >>> (32 - m))) & M;
                rl = (((sh << m) & M) | (sl >>> (32 - m))) & M;
            }
            const dst = PI[i];
            bHi[dst] = rh;
            bLo[dst] = rl;
        }

        // Chi
        for (let y = 0; y < 25; y += 5) {
            for (let x = 0; x < 5; x++) {
                const x1 = y + ((x + 1) % 5);
                const x2 = y + ((x + 2) % 5);
                stateHi[y + x] = (bHi[y + x] ^ (~bHi[x1] & bHi[x2])) & M;
                stateLo[y + x] = (bLo[y + x] ^ (~bLo[x1] & bLo[x2])) & M;
            }
        }

        // Iota
        stateHi[0] = (stateHi[0] ^ RC_HI[round]) & M;
        stateLo[0] = (stateLo[0] ^ RC_LO[round]) & M;
    }
}

const RATE = 136;

export function keccak256(data: Uint8Array): Uint8Array {
    const stateHi = new Array<number>(25);
    const stateLo = new Array<number>(25);
    for (let i = 0; i < 25; i++) {
        stateHi[i] = 0;
        stateLo[i] = 0;
    }

    const len = data.length;
    let offset = 0;

    // Absorb full blocks
    while (offset + RATE <= len) {
        for (let i = 0; i < 17; i++) {
            const p = offset + i * 8;
            const lo = (data[p] | (data[p + 1] << 8) | (data[p + 2] << 16) | ((data[p + 3] << 24) & M)) & M;
            const hi = (data[p + 4] | (data[p + 5] << 8) | (data[p + 6] << 16) | ((data[p + 7] << 24) & M)) & M;
            stateLo[i] = (stateLo[i] ^ lo) & M;
            stateHi[i] = (stateHi[i] ^ hi) & M;
        }
        keccakF(stateHi, stateLo);
        offset += RATE;
    }

    // Pad: copy remaining bytes into a block buffer
    const remaining = len - offset;
    const block = new Uint8Array(RATE);
    for (let i = 0; i < remaining; i++) {
        block[i] = data[offset + i];
    }
    // Keccak padding: 0x01 after data, 0x80 at end of rate block
    block[remaining] = 0x01;
    block[RATE - 1] = block[RATE - 1] | 0x80;

    // Absorb final block
    for (let i = 0; i < 17; i++) {
        const p = i * 8;
        const lo = (block[p] | (block[p + 1] << 8) | (block[p + 2] << 16) | ((block[p + 3] << 24) & M)) & M;
        const hi = (block[p + 4] | (block[p + 5] << 8) | (block[p + 6] << 16) | ((block[p + 7] << 24) & M)) & M;
        stateLo[i] = (stateLo[i] ^ lo) & M;
        stateHi[i] = (stateHi[i] ^ hi) & M;
    }
    keccakF(stateHi, stateLo);

    // Squeeze: 4 lanes = 32 bytes, little-endian
    const out = new Uint8Array(32);
    for (let i = 0; i < 4; i++) {
        const lo = stateLo[i] & M;
        const hi = stateHi[i] & M;
        const p = i * 8;
        out[p] = lo & 0xFF;
        out[p + 1] = (lo >>> 8) & 0xFF;
        out[p + 2] = (lo >>> 16) & 0xFF;
        out[p + 3] = (lo >>> 24) & 0xFF;
        out[p + 4] = hi & 0xFF;
        out[p + 5] = (hi >>> 8) & 0xFF;
        out[p + 6] = (hi >>> 16) & 0xFF;
        out[p + 7] = (hi >>> 24) & 0xFF;
    }

    return out;
}
