import { Bitcoin } from '../../generator/btc_vm/bitcoin';
import { StackItem } from '../../generator/btc_vm/stack';
import { BtcArithmetic } from './btc-arithmetic';
import { bigintToNibblesLS, prime_bigint } from './common';

function getBitFromA(bitcoin: Bitcoin, a: StackItem[], bit: number): StackItem {
    const table: StackItem[] = [];
    for (let i = 0; i < 8; i++) {
        table[i] = bitcoin.newStackItem(i & (2 ** (bit % 3)) ? 1 : 0);
    }

    const si = a[Math.floor(bit / 3)];
    const temp = bitcoin.newStackItem(0);
    bitcoin.tableFetch(temp, table[0], si);
    bitcoin.drop(table);
    return temp;
}

export function _verifyAndBit(
    bitcoin: Bitcoin,
    a: StackItem[],
    b: StackItem[],
    c: StackItem[],
    bit: number,
    notFlag: boolean
) {
    const bitValue = getBitFromA(bitcoin, a, bit);

    const temp_b = bitcoin.newStackItem(0);
    bitcoin.equalMany(temp_b, c, b);

    const zero = bitcoin.newNibbles(b.length);
    const temp_0 = bitcoin.newStackItem(0);
    bitcoin.equalMany(temp_0, c, zero);
    bitcoin.drop(zero);

    // bitValue && temp_b || !bitValue && temp_0

    bitcoin.pick(bitValue);
    if (notFlag) bitcoin.OP_NOT();
    bitcoin.pick(temp_b);
    bitcoin.OP_BOOLAND();

    bitcoin.pick(bitValue);
    if (!notFlag) bitcoin.OP_NOT();
    bitcoin.pick(temp_0);
    bitcoin.OP_BOOLAND();

    bitcoin.OP_BOOLOR();
    bitcoin.OP_VERIFY();

    bitcoin.drop([bitValue, temp_0, temp_b]);
}

export function verifyAndBit(bitcoin: Bitcoin, a: StackItem[], b: StackItem[], c: StackItem[], bit: number) {
    _verifyAndBit(bitcoin, a, b, c, bit, false);
}

export function verifyAndNotBit(bitcoin: Bitcoin, a: StackItem[], b: StackItem[], c: StackItem[], bit: number) {
    _verifyAndBit(bitcoin, a, b, c, bit, true);
}

export function verifyAddMod(bitcoin: Bitcoin, a: StackItem[], b: StackItem[], c: StackItem[]) {
    const btca = new BtcArithmetic(bitcoin);
    const w_p = btca.addWitness(bigintToNibblesLS(prime_bigint, 86));
    btca.initializeAddTables();
    const t = btca.add(a, b);
    btca.drop(a);
    btca.drop(b);
    const c2 = btca.add(w_p, c);
    btca.drop(w_p);
    const e1 = btca.equal(t, c);
    const e2 = btca.equal(t, c2);
    bitcoin.or(e1, e1, e2);
    bitcoin.assertOne(e1);
}

export function verifySubMod(bitcoin: Bitcoin, a: StackItem[], b: StackItem[], c: StackItem[]) {
    // a - b = c => a = c + b
    verifyAddMod(bitcoin, b, c, a);
}

export function verifyMulMod(bitcoin: Bitcoin, a: StackItem[], b: StackItem[], c: StackItem[], d: StackItem[]) {
    const btca = new BtcArithmetic(bitcoin);
    const w_p = btca.addWitness(bigintToNibblesLS(prime_bigint, 86));
    btca.initializeAddTables();
    btca.initializeMulTables();
    const m = btca.karatsubaMult(a, b, 1);
    btca.drop(a);
    btca.drop(b);
    let t = btca.karatsubaMult(w_p, d, 1);
    btca.drop(w_p);
    btca.drop(d);
    t = btca.add(t, c);
    btca.verifyEqual(t, m);
}

export function verifyDivMod(bitcoin: Bitcoin, a: StackItem[], b: StackItem[], c: StackItem[], d: StackItem[]) {
    // a / b = c => a = b * c
    verifyMulMod(bitcoin, b, c, a, d);
}

export function verifyMov(bitcoin: Bitcoin, a: StackItem[], c: StackItem[]) {
    bitcoin.verifyEqualMany(a, c);
}

export function verifyEqual(bitcoin: Bitcoin, a: StackItem[], b: StackItem[], c: StackItem[]) {
    bitcoin.assertEqualMany(a, b, c);
}

export function verifyOr(bitcoin: Bitcoin, a: StackItem[], b: StackItem[], c: StackItem[]) {
    bitcoin.assertOrMany(a, b, c);
}

export function verifyAnd(bitcoin: Bitcoin, a: StackItem[], b: StackItem[], c: StackItem[]) {
    bitcoin.assertAndMany(a, b, c);
}

export function verifyNot(bitcoin: Bitcoin, a: StackItem[], c: StackItem[]) {
    bitcoin.assertNotMany(a, c);
}

export function verifyAssertOne(bitcoin: Bitcoin, a: StackItem[]) {
    bitcoin.assertOneMany(a);
}

export function verifyAssertZero(bitcoin: Bitcoin, a: StackItem[]) {
    bitcoin.assertZeroMany(a);
}
