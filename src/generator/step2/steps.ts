

import { Register } from "../common/register";
import { vm } from "./vm/vm";

const temp1 = vm.newRegister();
const temp2 = vm.newRegister();
// rotr(s0_1, w[i - 15], 7);

// rotr(s0_2, w[i - 15], 18);
// shr(s0_3, w[i - 15], 3);
// xorxor(s0, s0_1, s0_2, s0_3);
export function step1(dst: Register, src: Register) {
    vm.rotr(temp1, src, 7);
    vm.rotr(temp2, src, 18);
    vm.xor(temp1, temp1, temp2);
    vm.shr(temp2, src, 3);
    vm.xor(dst, temp1, temp2);
}

// rotr(s0_1, w[i - 2], 17);
// rotr(s0_2, w[i - 2], 19);
// shr(s0_3, w[i - 2], 10);
// xorxor(s1, s0_1, s0_2, s0_3);
export function step2(dst: Register, src: Register) {
    vm.rotr(temp1, src, 17);
    vm.rotr(temp2, src, 19);
    vm.xor(temp1, temp1, temp2);
    vm.shr(temp2, src, 10);
    vm.xor(dst, temp1, temp2);
}

export function step3(dst: Register, src: Register) {
    vm.rotr(temp1, src, 6);
    vm.rotr(temp2, src, 11);
    vm.xor(temp1, temp1, temp2);
    vm.rotr(temp2, src, 25);
    vm.xor(dst, temp1, temp2);
}

// rotr(s0_1, a, 2);
// rotr(s0_2, a, 13);
// shr(s0_3, a, 22);
// xorxor(s0, s0_1, s0_2, s0_3);
export function step4(dst: Register, src: Register) {
    vm.rotr(temp1, src, 2);
    vm.rotr(temp2, src, 13);
    vm.xor(temp1, temp1, temp2);
    vm.shr(temp2, src, 22);
    vm.xor(dst, temp1, temp2);
}

// and(s0_1, e, f);
// not(s0_2, e);
// and(s0_3, s0_2, g);
// xor(ch, s0_1, s0_3);
export function step5(dst: Register, e: Register, f: Register, g: Register) {
    vm.and(temp1, e, f);
    vm.not(temp2, e);
    vm.and(temp2, temp2, g);
    vm.xor(dst, temp1, temp2);
}

// and(s0_1, a, b);
// and(s0_2, a, c);
// and(s0_3, b, c);
// xorxor(m, s0_1, s0_2, s0_3);
export function step6(dst: Register, a: Register, b: Register, c: Register) {
    vm.and(temp1, a, b);
    vm.and(temp2, a, c);
    vm.xor(dst, temp1, temp2);
    vm.and(temp1, b, c);
    vm.xor(dst, dst, temp1);
}
