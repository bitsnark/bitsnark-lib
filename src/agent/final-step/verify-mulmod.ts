import assert from "assert";
import { StackItem } from "../../generator/step3/stack";
import { bigintToNibblesLS } from "./common";
import { BtcArithmetic } from "./btc-arithmetic";

export const prime_bigint = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;

export function verifyMulMod(a: bigint, b: bigint, c: bigint, d: bigint): BtcArithmetic {

    const btca = new BtcArithmetic();

    const w_a = btca.addWitness(bigintToNibblesLS(a, 86));
    const w_b = btca.addWitness(bigintToNibblesLS(b, 86));
    const w_p = btca.addWitness(bigintToNibblesLS(prime_bigint, 86));
    const w_d = btca.addWitness(bigintToNibblesLS(d, 86));
    const w_c = btca.addWitness(bigintToNibblesLS(c, 86));

    btca.initializeAddTables();
    btca.initializeMulTables();

    const m = btca.karatsubaMult(w_a, w_b, 1);
    btca.drop(w_a);
    btca.drop(w_b);
    let t = btca.karatsubaMult(w_p, w_d, 1);
    btca.drop(w_p);
    btca.drop(w_d);
    t = btca.add(t, w_c);

    btca.verifyEqual(t, m);

    return btca;
}

/*** test   ***/

function checkEqual(a: StackItem[], b: number[]): boolean {
    let flag = true;
    for (let i = 0; i < a.length; i++) {
        if ((b[i] ?? 0) != (Number(a[i]?.value ?? 0n)))
            flag = false;
    }
    return flag;
}

function bigRandom(level: number): bigint {
    let n = 0n;
    for (let i = 0; i < level; i++) {
        n = n + BigInt(Math.round(100 * Math.random()));
        n = n * 100n;
    }
    return n % (2n ** 256n - 1n);
}

function test() {

    {
        const btca = new BtcArithmetic();
        const a = bigRandom(256);
        const b = bigRandom(256);
        const c = a * b;
        const w_a = btca.addWitness(bigintToNibblesLS(a, 86));
        const w_b = btca.addWitness(bigintToNibblesLS(b, 86));

        btca.initializeAddTables();
        btca.initializeMulTables();

        const result = btca.karatsubaMult(w_a, w_b, 3);

        const f = checkEqual(result, bigintToNibblesLS(c));
        console.log(a, b, c, f);
        console.log('karatsuba     script: ', btca.bitcoin.programSizeInBitcoinBytes(), '   stack: ', btca.bitcoin.maxStack);

        assert(f);
    }

    {
        const btca = new BtcArithmetic();
        const a = bigRandom(256);
        const b = bigRandom(256);
        const c = a * b;
        const w_a = btca.addWitness(bigintToNibblesLS(a, 86));
        const w_b = btca.addWitness(bigintToNibblesLS(b, 86));

        btca.initializeAddTables();
        btca.initializeMulTables();

        const result = btca.naiiveMult(w_a, w_b);

        const f = checkEqual(result, bigintToNibblesLS(c));
        console.log(a, b, c, f);
        console.log('naiive        script: ', btca.bitcoin.programSizeInBitcoinBytes(), '   stack: ', btca.bitcoin.maxStack);
        assert(f);
    }

    {
        const a = bigRandom(256);
        const b = bigRandom(256);
        const c = a * b % prime_bigint;
        const d = a * b / prime_bigint;

        const btca = verifyMulMod(a, b, c, d);

        console.log('verifyMulMod   script: ', btca.bitcoin.programSizeInBitcoinBytes(), '   stack: ', btca.bitcoin.maxStack);
        console.log('success: ', btca.bitcoin.success);
    }
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    test();
}
