

import { StackItem } from "../stack";
import { bitcoin, dropBits, makeBits, Word } from "./word";

function rotr(bits: StackItem[], n: number, i: number): StackItem {
    return bits[(i + n) % 32];
}

function shr(bits: StackItem[], n: number, i: number): StackItem {
    const t = i + n;
    return bits[t];
}

function xorxor(target: StackItem, a: StackItem, b: StackItem, c: StackItem) {
    bitcoin.xor(target, a, b);
    bitcoin.xor(target, target, c);
}

const dstBits = makeBits();

// rotr(s0_1, w[i - 15], 7);
// rotr(s0_2, w[i - 15], 18);
// shr(s0_3, w[i - 15], 3);
// xorxor(s0, s0_1, s0_2, s0_3);
export function step1(dst: Word, src: Word) {
    const srcBits = makeBits(src);
    for (let i = 0; i < 32; i++) {
        const a1 = rotr(srcBits, 7, i);
        const a2 = rotr(srcBits, 18, i);
        const a3 = shr(srcBits, 3, i);
        if (a3) {
            xorxor(dstBits[i], a1, a2, a3);    
        } else {
            bitcoin.xor(dstBits[i], a1, a2);
        }
    }
    dst.fromBits(dstBits);
    dropBits(srcBits);
}

// rotr(s0_1, w[i - 2], 17);
// rotr(s0_2, w[i - 2], 19);
// shr(s0_3, w[i - 2], 10);
// xorxor(s1, s0_1, s0_2, s0_3);
export function step2(dst: Word, src: Word) {
    const srcBits = makeBits(src);
    for (let i = 0; i < 32; i++) {
        const a1 = rotr(srcBits, 17, i);
        const a2 = rotr(srcBits, 19, i);
        const a3 = shr(srcBits, 10, i);
        if (a3) {
            xorxor(dstBits[i], a1, a2, a3);    
        } else {
            bitcoin.xor(dstBits[i], a1, a2);
        }
    }
    dst.fromBits(dstBits);
    dropBits(srcBits);
}

export function step3(dst: Word, eBits: StackItem[]) {
    for (let i = 0; i < 32; i++) {
        const a1 = rotr(eBits, 6, i);
        const a2 = rotr(eBits, 11, i);
        const a3 = rotr(eBits, 25, i);
        xorxor(dstBits[i], a1, a2, a3);    
    }
    dst.fromBits(dstBits);
}

// rotr(s0_1, a, 2);
// rotr(s0_2, a, 13);
// shr(s0_3, a, 22);
// xorxor(s0, s0_1, s0_2, s0_3);
export function step4(dst: Word, aBits: StackItem[]) {
    for (let i = 0; i < 32; i++) {
        const a1 = rotr(aBits, 2, i);
        const a2 = rotr(aBits, 13, i);
        const a3 = shr(aBits, 22, i);
        if (a3) {
            xorxor(dstBits[i], a1, a2, a3);    
        } else {
            bitcoin.xor(dstBits[i], a1, a2);
        }
    }
    dst.fromBits(dstBits);
}

// and(s0_1, e, f);
// not(s0_2, e);
// and(s0_3, s0_2, g);
// xor(ch, s0_1, s0_3);
export function step5(dst: Word, eBits: StackItem[], f: Word, g: Word) {
    const fBits = makeBits(f);
    const gBits = makeBits(g);
    for (let i = 0; i < 32; i++) {
        bitcoin.pick(eBits[i]);
        bitcoin.pick(fBits[i]);
        bitcoin.OP_BOOLAND();
        bitcoin.pick(eBits[i]);
        bitcoin.OP_NOT();
        bitcoin.pick(gBits[i]);
        bitcoin.OP_BOOLAND();
        bitcoin.OP_ADD();
        bitcoin.OP_0_16(1);
        bitcoin.OP_NUMEQUAL();
        bitcoin.replaceWithTop(dstBits[i]);
    }
    dst.fromBits(dstBits);
    dropBits(fBits);
    dropBits(gBits);
}

// and(s0_1, a, b);
// and(s0_2, a, c);
// and(s0_3, b, c);
// xorxor(m, s0_1, s0_2, s0_3);
export function step6(dst: Word, aBits: StackItem[], b: Word, c: Word) {
    const bBits = makeBits(b);
    const cBits = makeBits(c);
    for (let i = 0; i < 32; i++) {
        const test = (aBits[i].value & bBits[i].value) ^
                     (aBits[i].value & cBits[i].value) ^ 
                     (bBits[i].value & cBits[i].value);
        bitcoin.pick(aBits[i]);
        bitcoin.pick(bBits[i]);
        bitcoin.OP_BOOLAND();
        bitcoin.pick(aBits[i]);
        bitcoin.pick(cBits[i]);
        bitcoin.OP_BOOLAND();
        bitcoin.pick(bBits[i]);
        bitcoin.pick(cBits[i]);
        bitcoin.OP_BOOLAND();
        bitcoin.OP_ADD();
        bitcoin.OP_0_16(1);
        bitcoin.OP_NUMEQUAL();
        bitcoin.OP_ADD();
        bitcoin.OP_0_16(1);
        bitcoin.OP_NUMEQUAL();
        bitcoin.replaceWithTop(dstBits[i]);
        if (test != dstBits[i].value) throw new Error('Foo');
    }
    dst.fromBits(dstBits);
    dropBits(bBits);
    dropBits(cBits);
}
