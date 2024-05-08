import { assert } from "chai";
import { step1, step2, step3, step4, step5, step6 } from "./steps";
import { makeRegisters, prepareWitness, toNum } from "./utils";
import { Register } from "./vm/state";
import { vm } from "./vm/vm";

const h_hex = [0x6a09e667n, 0xbb67ae85n, 0x3c6ef372n, 0xa54ff53an, 0x510e527fn, 0x9b05688cn, 0x1f83d9abn, 0x5be0cd19n];

const k_hex = [0x428a2f98n, 0x71374491n, 0xb5c0fbcfn, 0xe9b5dba5n, 0x3956c25bn, 0x59f111f1n, 0x923f82a4n,
    0xab1c5ed5n, 0xd807aa98n, 0x12835b01n, 0x243185ben, 0x550c7dc3n, 0x72be5d74n, 0x80deb1fen,
    0x9bdc06a7n, 0xc19bf174n, 0xe49b69c1n, 0xefbe4786n, 0x0fc19dc6n, 0x240ca1ccn, 0x2de92c6fn,
    0x4a7484aan, 0x5cb0a9dcn, 0x76f988dan, 0x983e5152n, 0xa831c66dn, 0xb00327c8n, 0xbf597fc7n,
    0xc6e00bf3n, 0xd5a79147n, 0x06ca6351n, 0x14292967n, 0x27b70a85n, 0x2e1b2138n, 0x4d2c6dfcn,
    0x53380d13n, 0x650a7354n, 0x766a0abbn, 0x81c2c92en, 0x92722c85n, 0xa2bfe8a1n, 0xa81a664bn,
    0xc24b8b70n, 0xc76c51a3n, 0xd192e819n, 0xd6990624n, 0xf40e3585n, 0x106aa070n, 0x19a4c116n,
    0x1e376c08n, 0x2748774cn, 0x34b0bcb5n, 0x391c0cb3n, 0x4ed8aa4an, 0x5b9cca4fn, 0x682e6ff3n,
    0x748f82een, 0x78a5636fn, 0x84c87814n, 0x8cc70208n, 0x90befffan, 0xa4506cebn, 0xbef9a3f7n,
    0xc67178f2n];

function hardcoded(data: bigint[]): Register[] {
    return data.map(v => vm.hardcode(v));
}

const [h0, h1, h2, h3, h4, h5, h6, h7] = hardcoded(h_hex);
let k = hardcoded(k_hex);

const s0 = vm.newRegister();
const s1 = vm.newRegister();
const ch = vm.newRegister();
const s0_1 = vm.newRegister();
const temp1 = vm.newRegister();
const temp2 = vm.newRegister();
const m = vm.newRegister();

export function hash(target: Register[], w: Register[]) {

    let a = vm.newRegister(h0.value);
    let b = vm.newRegister(h1.value);
    let c = vm.newRegister(h2.value);
    let d = vm.newRegister(h3.value);
    let e = vm.newRegister(h4.value);
    let f = vm.newRegister(h5.value);
    let g = vm.newRegister(h6.value);
    let h = vm.newRegister(h7.value);

    const regsToFree: Register[] = [];
    while (w.length < 64) {
        const r = vm.newRegister();
        regsToFree.push(r);
        w.push(r);
    }

    for (let i = 16; i < 64; i++) {
        step1(temp1, w[i - 15]);
        step2(temp2, w[i - 2]);

        vm.add(w[i], w[i - 16], temp1);
        vm.add(w[i], w[i], w[i - 7]);
        vm.add(w[i], w[i], temp2);
    }

    for (let j = 0; j < 64; j++) {
        step3(s1, e);
        step4(s0, a);
        step5(ch, e, f, g);
        step6(m, a, b, c);

        vm.add(temp2, s0, m);

        vm.add(s0_1, h, s1);
        vm.add(s0_1, s0_1, ch);
        vm.add(s0_1, s0_1, k[j]);
        vm.add(temp1, s0_1, w[j]);

        vm.mov(h, g);
        vm.mov(g, f);
        vm.mov(f, e);
        vm.add(e, d, temp1);

        vm.mov(d, c);
        vm.mov(c, b);
        vm.mov(b, a);
        vm.add(a, temp1, temp2);
    }

    vm.add(target[0], h0, a)
    vm.add(target[1], h1, b)
    vm.add(target[2], h2, c)
    vm.add(target[3], h3, d)
    vm.add(target[4], h4, e)
    vm.add(target[5], h5, f)
    vm.add(target[6], h6, g)
    vm.add(target[7], h7, h)

    vm.state.freeRegisters(regsToFree);
    vm.state.freeRegisters([a, b, c, d, e, f, g, h]);
}

const chunk1 = 0x3487578354897345987abbf713298017347dddcca8760987aabbbccdd9879879n;
const chunk2 = 0x8abbfc987987987abb00ccd98798798ffffffbbbc908797987cccdddddaaaaaan;
const testHash = 0x54c3f3d905082f7f3b20538aa7219eb64af6be46b7cbbaa90a779748606b9a5cn;

const out = makeRegisters(8);
hash(out, [...prepareWitness(chunk1), ...prepareWitness(chunk2)]);
console.log('Result: ', out.map(t => t.value.toString(16)));
console.log(`Success: ${vm.success}   \t   Instructions: ${vm.instructions.length}   \t   Registers: ${vm.state.maxRegCount}`)

assert(toNum(out) == testHash);
