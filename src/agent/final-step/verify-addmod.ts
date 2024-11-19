import { bigintToNibblesLS, nibblesToBigintLS } from './common';
import { BtcArithmetic } from './btc-arithmetic';
import { Bitcoin } from '../../generator/btc_vm/bitcoin';

export const prime_bigint = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;

export function verifyAddMod(bitcoin: Bitcoin, a: bigint, b: bigint, c: bigint): BtcArithmetic {
    console.log('a', a);
    console.log('b', b);
    console.log('c', c);

    const btca = new BtcArithmetic(bitcoin);

    const w_a = btca.addWitness(bigintToNibblesLS(a, 86));
    const w_b = btca.addWitness(bigintToNibblesLS(b, 86));
    const w_p = btca.addWitness(bigintToNibblesLS(prime_bigint, 86));
    const w_c = btca.addWitness(bigintToNibblesLS(c, 86));

    btca.initializeAddTables();

    const t = btca.add(w_a, w_b);
    btca.drop(w_a);
    btca.drop(w_b);

    console.log('t', nibblesToBigintLS(t));

    const c2 = btca.add(w_p, w_c);
    btca.drop(w_p);

    console.log('c2', nibblesToBigintLS(c2));

    const e1 = btca.equal(t, w_c);

    console.log('e1', nibblesToBigintLS([e1]));

    const e2 = btca.equal(t, c2);

    console.log('e2', nibblesToBigintLS([e2]));

    btca.bitcoin.or(e1, e1, e2);
    btca.bitcoin.assertOne(e1);

    return btca;
}

/*** test   ***/

function bigRandom(level: number): bigint {
    let n = 0n;
    for (let i = 0; i < level; i++) {
        n = n + BigInt(Math.round(100 * Math.random()));
        n = n * 100n;
    }
    return n % prime_bigint;
}

function test() {
    {
        const a = bigRandom(256);
        const b = bigRandom(256);
        const c = (a + b) % prime_bigint;

        const btca = verifyAddMod(new Bitcoin(), a, b, c);

        console.log(
            'verifyAddMod   script: ',
            btca.bitcoin.programSizeInBitcoinBytes(),
            '   stack: ',
            btca.bitcoin.maxStack
        );
        console.log('success: ', btca.bitcoin.success);
    }
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    test();
}
