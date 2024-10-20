import { Register } from "../common/register";
import { step2_vm as vm } from "./vm/vm";
import { _256 } from "./vm/types"

const mask32 = 0xffffffffn;

const hHex = [0x6a09e667n, 0xbb67ae85n, 0x3c6ef372n, 0xa54ff53an, 0x510e527fn, 0x9b05688cn, 0x1f83d9abn, 0x5be0cd19n];

const kHex = [0x428a2f98n, 0x71374491n, 0xb5c0fbcfn, 0xe9b5dba5n, 0x3956c25bn, 0x59f111f1n, 0x923f82a4n,
    0xab1c5ed5n, 0xd807aa98n, 0x12835b01n, 0x243185ben, 0x550c7dc3n, 0x72be5d74n, 0x80deb1fen,
    0x9bdc06a7n, 0xc19bf174n, 0xe49b69c1n, 0xefbe4786n, 0x0fc19dc6n, 0x240ca1ccn, 0x2de92c6fn,
    0x4a7484aan, 0x5cb0a9dcn, 0x76f988dan, 0x983e5152n, 0xa831c66dn, 0xb00327c8n, 0xbf597fc7n,
    0xc6e00bf3n, 0xd5a79147n, 0x06ca6351n, 0x14292967n, 0x27b70a85n, 0x2e1b2138n, 0x4d2c6dfcn,
    0x53380d13n, 0x650a7354n, 0x766a0abbn, 0x81c2c92en, 0x92722c85n, 0xa2bfe8a1n, 0xa81a664bn,
    0xc24b8b70n, 0xc76c51a3n, 0xd192e819n, 0xd6990624n, 0xf40e3585n, 0x106aa070n, 0x19a4c116n,
    0x1e376c08n, 0x2748774cn, 0x34b0bcb5n, 0x391c0cb3n, 0x4ed8aa4an, 0x5b9cca4fn, 0x682e6ff3n,
    0x748f82een, 0x78a5636fn, 0x84c87814n, 0x8cc70208n, 0x90befffan, 0xa4506cebn, 0xbef9a3f7n,
    0xc67178f2n];

const mask32Reg = vm.hardcode(mask32);
const hReg = vm.initHardcoded(hHex);
const kReg = vm.initHardcoded(kHex);
const Sigma0Reg = vm.initHardcoded([2n, 13n, 22n]);
const Sigma1Reg = vm.initHardcoded([6n, 11n, 25n]);
const sigma0Reg = vm.initHardcoded([7n, 18n, 3n]);
const sigma1Reg = vm.initHardcoded([17n, 19n, 10n]);
const shabitReg = vm.hardcode(0x80000000n);
const shalen1 = vm.hardcode(256n);
const shalen2 = vm.hardcode(512n);

export class SHA256 {
    W: Register[] = [];
    t1: Register;
    T0: Register;
    T1: Register;
    T2: Register;
    hash: Register[] = [];
    h: Register[] = [];

    constructor() {
        this.T0 = vm.newRegister(true);
        this.T1 = vm.newRegister(true);
        this.T2 = vm.newRegister(true);
        this.t1 = vm.newRegister(true);
        for (let i = 0; i < 8; i++) {
            this.hash[i] = vm.newRegister(true);
            this.h[i] = vm.newRegister(true);
        }
    }

    free() {
        vm.freeRegister(this.T0);
        vm.freeRegister(this.T1);
        vm.freeRegister(this.T2);
        vm.freeRegister(this.t1);
        for (let i = 0; i < 8; i++) {
            vm.freeRegister(this.hash[i]);
            vm.freeRegister(this.h[i]);
        }
    }
    
    ch(target: Register, x: Register, y: Register, z: Register) {
        vm.and(target, x, y);
        vm.not(this.t1, x);
        vm.and(this.t1, this.t1, z);
        vm.xor(target, target, this.t1);
    }

    maj(target: Register, x: Register, y: Register, z: Register) {
        vm.and(target, x, y);
        vm.and(this.t1, x, z);
        vm.xor(target, target, this.t1);
        vm.and(this.t1, y, z);
        vm.xor(target, target, this.t1);
    }
    
    bigsigma0(target: Register, x: Register) {
        vm.rotr(target, x, Sigma0Reg[0]);
        vm.rotr(this.t1, x, Sigma0Reg[1]);
        vm.xor(target, target, this.t1);
        vm.rotr(this.t1, x, Sigma0Reg[2]);
        vm.xor(target, target, this.t1);
    }

    bigsigma1(target: Register, x: Register) {
        vm.rotr(target, x, Sigma1Reg[0]);
        vm.rotr(this.t1, x, Sigma1Reg[1]);
        vm.xor(target, target, this.t1);
        vm.rotr(this.t1, x, Sigma1Reg[2]);
        vm.xor(target, target, this.t1);
    }

    sigma0(target: Register, x: Register) {
        vm.rotr(target, x, sigma0Reg[0]);
        vm.rotr(this.t1, x, sigma0Reg[1]);
        vm.xor(target, target, this.t1);
        vm.shr(this.t1, x, sigma0Reg[2]);
        vm.xor(target, target, this.t1);
    }

    sigma1(target: Register, x: Register) {
        vm.rotr(target, x, sigma1Reg[0]);
        vm.rotr(this.t1, x, sigma1Reg[1]);
        vm.xor(target, target, this.t1);
        vm.shr(this.t1, x, sigma1Reg[2]);
        vm.xor(target, target, this.t1);
    }

    calculateW(index: number) {
        vm.add(this.W[index], this.W[index], this.W[(index+9) & 0xf]);
        this.sigma1(this.T1, this.W[(index+14) & 0xf]);
        vm.add(this.W[index], this.W[index], this.T1);
        this.sigma0(this.T1, this.W[(index+1) & 0xf]);
        vm.add(this.W[index], this.W[index], this.T1);
        vm.and(this.W[index], this.W[index], mask32Reg);
    }

    calculateHash() {
        for (let i = 0; i < 8; i++) {
            vm.mov(this.h[i], this.hash[i]);
        }
        for (let i = 0; i < 4; i++) {
            const block = i * 16;
            for (let j = 0; j < 16; j++) {
                if ( i > 0) {
                    this.calculateW(j);
                }
                this.bigsigma1(this.T1, this.h[4]);
                vm.add(this.T1, this.T1, this.h[7]);
                this.ch(this.T0, this.h[4], this.h[5], this.h[6]);
                vm.add(this.T1, this.T1, this.T0);
                vm.add(this.T1, this.T1, kReg[block+j]);
                vm.add(this.T1, this.T1, this.W[j]);
                vm.and(this.T1, this.T1, mask32Reg);

                this.bigsigma0(this.T2, this.h[0]);
                this.maj(this.T0, this.h[0], this.h[1], this.h[2]);
                vm.add(this.T2, this.T2, this.T0);
                vm.and(this.T2, this.T2, mask32Reg);

                vm.mov(this.h[7], this.h[6]);
                vm.mov(this.h[6], this.h[5]);
                vm.mov(this.h[5], this.h[4]);
                vm.mov(this.h[4], this.h[3]);
                vm.add(this.h[4], this.h[4], this.T1);
                vm.and(this.h[4], this.h[4], mask32Reg);
                vm.mov(this.h[3], this.h[2]);
                vm.mov(this.h[2], this.h[1]);
                vm.mov(this.h[1], this.h[0]);
                vm.mov(this.h[0], this.T1);
                vm.add(this.h[0], this.h[0], this.T2);
                vm.and(this.h[0], this.h[0], mask32Reg);
            }
        }
        for (let i = 0; i < 8; i++) {
            vm.add(this.hash[i], this.hash[i], this.h[i]);
            vm.and(this.hash[i], this.hash[i], mask32Reg);
        }
    }

    sha256(target: _256, a: _256) {
        for (let i = 0 ; i < 8 ; i++) {
            vm.mov(this.hash[i], hReg[i]);
        }
        for (let i = 0; i < 8; i++) {
            this.W[i] = a[i];
            this.W[i+8] = vm.newRegister(true);
        }
        vm.mov(this.W[8], shabitReg);
        vm.mov(this.W[15], shalen1);
        this.calculateHash()
        for (let i = 0 ; i < 8 ; i++) {
            vm.mov(target[i], this.hash[i]);
            vm.freeRegister(this.W[i+8]);
        }
    }

    sha256pair(target: _256, a: _256, b: _256) {
        for (let i = 0 ; i < 8 ; i++) {
            vm.mov(this.hash[i], hReg[i]);
        }
        for (let i = 0; i < 8; i++) {
            this.W[i] = a[i];
            this.W[i+8] = b[i];
        }
        this.calculateHash()
        for (let i = 1; i < 15; i++) {
            vm.mov(this.W[i], vm.zero);
        }
        vm.mov(this.W[0], shabitReg);
        vm.mov(this.W[15], shalen2);
        this.calculateHash();
        for (let i = 0 ; i < 8 ; i++) {
            vm.mov(target[i], this.hash[i]);
        }
    }
}