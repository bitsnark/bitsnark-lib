import { Register } from "../common/register";
import { step2_vm as vm } from "./vm/vm";
import { _256 } from "./vm/types"

const h_hex = [0x6a09e667n, 0xbb67ae85n, 0x3c6ef372n, 0xa54ff53an, 0x510e527fn, 0x9b05688cn, 0x1f83d9abn, 0x5be0cd19n]

const k_hex = [0x428a2f98n, 0x71374491n, 0xb5c0fbcfn, 0xe9b5dba5n, 0x3956c25bn, 0x59f111f1n, 0x923f82a4n,
    0xab1c5ed5n, 0xd807aa98n, 0x12835b01n, 0x243185ben, 0x550c7dc3n, 0x72be5d74n, 0x80deb1fen,
    0x9bdc06a7n, 0xc19bf174n, 0xe49b69c1n, 0xefbe4786n, 0x0fc19dc6n, 0x240ca1ccn, 0x2de92c6fn,
    0x4a7484aan, 0x5cb0a9dcn, 0x76f988dan, 0x983e5152n, 0xa831c66dn, 0xb00327c8n, 0xbf597fc7n,
    0xc6e00bf3n, 0xd5a79147n, 0x06ca6351n, 0x14292967n, 0x27b70a85n, 0x2e1b2138n, 0x4d2c6dfcn,
    0x53380d13n, 0x650a7354n, 0x766a0abbn, 0x81c2c92en, 0x92722c85n, 0xa2bfe8a1n, 0xa81a664bn,
    0xc24b8b70n, 0xc76c51a3n, 0xd192e819n, 0xd6990624n, 0xf40e3585n, 0x106aa070n, 0x19a4c116n,
    0x1e376c08n, 0x2748774cn, 0x34b0bcb5n, 0x391c0cb3n, 0x4ed8aa4an, 0x5b9cca4fn, 0x682e6ff3n,
    0x748f82een, 0x78a5636fn, 0x84c87814n, 0x8cc70208n, 0x90befffan, 0xa4506cebn, 0xbef9a3f7n,
    0xc67178f2n]

function ch(target: Register, x: Register, y: Register, z: Register) {
    let t1 = vm.newRegister()
    let t2 = vm.newRegister()
    vm.and(t1, x, y)
    vm.not(t2, x)
    vm.and(t2, t2, z)
    vm.xor(target, t1, t2)
    vm.freeRegister(t1)
    vm.freeRegister(t2)
}

function maj(target: Register, x: Register, y: Register, z: Register) {
    let t1 = vm.newRegister()
    let t2 = vm.newRegister()
    let t3 = vm.newRegister()
    vm.and(t1, x, y)
    vm.and(t2, x, z)
    vm.and(t3, y, z)
    vm.xor(target, t1, t2)
    vm.xor(target, target, t3)
    vm.freeRegister(t1)
    vm.freeRegister(t2)
    vm.freeRegister(t3)
}

function bigsigma(target: Register, x: Register, a: bigint, b: bigint, c: bigint) {
    let t0 = vm.newRegister()
    let t1 = vm.newRegister()
    let t2 = vm.newRegister()
    let t3 = vm.newRegister()
    vm.setRegister(t0, a)
    vm.rotr(t1, x, t0)
    vm.setRegister(t0, b)
    vm.rotr(t2, x, t0)
    vm.setRegister(t0, c)
    vm.rotr(t3, x, t0)
    vm.xor(target, t1, t2)
    vm.xor(target, target, t3)
    vm.freeRegister(t0)
    vm.freeRegister(t1)
    vm.freeRegister(t2)
    vm.freeRegister(t3)
}

function sigma(target: Register, x: Register, a: bigint, b: bigint, c: bigint) {
    let t0 = vm.newRegister()
    let t1 = vm.newRegister()
    let t2 = vm.newRegister()
    let t3 = vm.newRegister()
    vm.setRegister(t0, a)
    vm.rotr(t1, x, t0)
    vm.setRegister(t0, b)
    vm.rotr(t2, x, t0)
    vm.setRegister(t0, c)
    vm.shr(t3, x, t0)
    vm.xor(target, t1, t2)
    vm.xor(target, target, t3)
    vm.freeRegister(t0)
    vm.freeRegister(t1)
    vm.freeRegister(t2)
    vm.freeRegister(t3)
}

export function hash(target: Register[], a: Register[]) {
    const mask = vm.newRegister()
    vm.setRegister(mask, 0xffffffffn)
    const T1 = vm.newRegister()
    const T2 = vm.newRegister()
    const tmp1 = vm.newRegister()
    const tmp2 = vm.newRegister()
    const W: Register[] = []
    for (let i = 0; i < 16; i++) {
        W.push(vm.newRegister())
        vm.mov(W[i], a[i])
    }
    for (let i = 16; i < 64; i++) {
        W.push(vm.newRegister());
        sigma(T1, W[i-2], 17n, 19n, 10n)
        sigma(T2, W[i-15], 7n, 18n, 3n)
        vm.add(W[i], T1, W[i-7])
        vm.add(W[i], W[i], T2)
        vm.add(W[i], W[i], W[i-16])
        vm.and(W[i], W[i], mask)
    }

    const h: Register[] = []
    for (let i = 0; i < 8; i++) {
        h.push(vm.newRegister())
        vm.mov(h[i], target[i])
    }

    for (let i = 0; i < 64; i++) {
        bigsigma(tmp1, h[4], 6n, 11n, 25n)
        ch(tmp2, h[4], h[5], h[6])
        vm.add(T1, h[7], tmp1)
        vm.add(T1, T1, tmp2)
        vm.setRegister(T2, k_hex[i])
        vm.add(T1, T1, T2)
        vm.add(T1, T1, W[i])
        vm.and(T1, T1, mask)

        bigsigma(tmp1, h[0], 2n, 13n, 22n)
        maj(tmp2, h[0], h[1], h[2])
        vm.add(T2, tmp1, tmp2)
        vm.and(T2, T2, mask)

        vm.mov(h[7], h[6])
        vm.mov(h[6], h[5])
        vm.mov(h[5], h[4])
        vm.mov(h[4], h[3])
        vm.add(h[4], h[4], T1)
        vm.and(h[4], h[4], mask)
        vm.mov(h[3], h[2])
        vm.mov(h[2], h[1])
        vm.mov(h[1], h[0])
        vm.mov(h[0], T1)
        vm.add(h[0], h[0], T2)
        vm.and(h[0], h[0], mask)
    }

    for (let i = 0; i < 8; i++) {
        vm.add(target[i], target[i], h[i])
        vm.and(target[i], target[i], mask)
    }

    vm.freeRegister(mask)
    vm.freeRegister(T1)
    vm.freeRegister(T2)
    vm.freeRegister(tmp1)
    vm.freeRegister(tmp2)
    for (let i = 0; i < 8; i++) {
        vm.freeRegister(h[i])
    }
    for (let i = 0; i < 64; i++) {
        vm.freeRegister(W[i]);
    }
}

export function sha256(target: _256, a: _256) {
    for (let i = 0 ; i < 8 ; i++) {
        vm.setRegister(target[i], h_hex[i])
    }
    let w: Register[] = []
    for (let i = 0; i < 16; i++) {
        w.push(vm.newRegister(true))
    }
    for (let i = 0; i < 8; i++) {
        vm.mov(w[i], a[i])
    }
    vm.setRegister(w[8], 0x80000000n)
    vm.setRegister(w[15], 256n)
    hash(target, w)
    for (let i = 0; i < 16; i++) {
        vm.freeRegister(w[i])
    }
}

export function sha256pair(target: _256, a: _256, b: _256) {
    for (let i = 0 ; i < 8 ; i++) {
        vm.setRegister(target[i], h_hex[i])
    }
    let w: Register[] = []
    for (let i = 0; i < 16; i++) {
        w.push(vm.newRegister(true))
    }
    for (let i = 0; i < 8; i++) {
        vm.mov(w[i], a[i])
        vm.mov(w[i+8], b[i])
    }
    hash(target, w)
    for (let i = 0; i < 16; i++) {
        vm.setRegister(w[i], 0n)
    }
    vm.setRegister(w[0], 0x80000000n)
    vm.setRegister(w[15], 512n)
    hash(target, w)
    for (let i = 0; i < 16; i++) {
        vm.freeRegister(w[i])
    }
}