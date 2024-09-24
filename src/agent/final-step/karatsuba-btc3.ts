import assert from "assert";
import { Bitcoin } from '../../generator/step3/bitcoin';
import { StackItem } from "../../generator/step3/stack";

export const prime_bigint = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;

let table: StackItem[] = [];
let tableRow: StackItem[] = [];
let breakTableValue: StackItem[] = [];
let breakTableCarry: StackItem[] = [];

function teaPot() {
    throw new Error("I'm a teapot");
}

function nibblesToBigintLS(s: StackItem[]): bigint {
    let result = 0n;
    for (let i = 0; i < s.length; i++) {
        result += BigInt(s[i].value) << (3n * BigInt(i));
    }
    return result;
}

function bigintToNibblesLS(n: bigint, c?: number): number[] {
    const result: number[] = [];
    for (let i = 0; (c && i < c) || (!c && n > 0); i++) {
        result.push(Number(n & 0x7n));
        n = n >> 3n;
    }
    if (n > 0)
        teaPot();
    return result;
}

function addWitness(bitcoin: Bitcoin, na: number[]) {
    const result: StackItem[] = [];
    for (let i = 0; i < na.length; i++) {
        result.push(bitcoin.newStackItem(BigInt(na[i])));
    }
    return result;
}

/***   arithmetic   ***/

function nibbleMult(bitcoin: Bitcoin, a: StackItem, b: StackItem) {
    bitcoin.pick(a);
    bitcoin.tableFetchInStack(tableRow);
    bitcoin.pick(b);
    bitcoin.OP_ADD();
    bitcoin.tableFetchInStack(table);
}

function add(bitcoin: Bitcoin, a: StackItem[], b: StackItem[]): StackItem[] {

    const result = bitcoin.newNibblesFast(Math.max(a.length, b.length) + 1);

    const stack = bitcoin.stack.items;

    const l = Math.max(a.length, b.length);
    for (let i = 0; i < l; i++) {

        if (i == 0) {
            bitcoin.OP_0_16(0n); // 0
        } else {
            bitcoin.OP_FROMALTSTACK();
        }

        bitcoin.pick(a[i]); // carry a[i]
        bitcoin.OP_ADD(); // carry+a[i]
        if (b[i]) {
            bitcoin.pick(b[i]); // carry+a[i] b[i]
            bitcoin.OP_ADD(); // carry+a[i]+b[i]
        }

        bitcoin.OP_DUP(); // carry+a[i]+b[i] carry+a[i]+b[i]
        bitcoin.tableFetchInStack(breakTableCarry); // new_carry
        bitcoin.OP_TOALTSTACK();

        bitcoin.tableFetchInStack(breakTableValue); // carry+a[i]+b[i] value
        bitcoin.replaceWithTop(result[i]); // carry+a[i]+b[i]
    }
    bitcoin.OP_FROMALTSTACK();
    bitcoin.replaceWithTop(result[l]); //

    if (nibblesToBigintLS(a) + nibblesToBigintLS(b) != nibblesToBigintLS(result))
        teaPot();

    return result;
}

function subtractFromA(bitcoin: Bitcoin, a: StackItem[], b: StackItem[]) {

    if (a.length < b.length)
        teaPot();

    const savedA = nibblesToBigintLS(a);
    const savedB = nibblesToBigintLS(b);

    const stack = bitcoin.stack.items;

    for (let i = 0; i < a.length; i++) {
        bitcoin.pick(a[i]); // a[i]

        if (i == 0) {
            bitcoin.OP_0_16(0n); // 0
        } else {
            bitcoin.OP_FROMALTSTACK();
        }

        if (b[i]) {
            bitcoin.pick(b[i]); // a[i] borrow b[i]
            bitcoin.OP_ADD(); // a[i] borrow+b[i]
        }
        bitcoin.OP_SUB(); // a[i]-borrow-b[i]
        bitcoin.OP_DUP(); // a[i]-borrow-b[i] a[i]-borrow-b[i]
        bitcoin.OP_0_16(0n); // a[i]-borrow-b[i] a[i]-borrow-b[i] 0
        bitcoin.OP_LESSTHAN(); // a[i]-borrow-b[i] flag

        const flag = stack[stack.length - 1].value;

        bitcoin.OP_IF(); // a[i]-borrow-b[i]
        bitcoin.OP_0_16(8n); // a[i]-borrow-b[i] 8 
        bitcoin.OP_ADD(); // a[i]-borrow-b[i]+8
        bitcoin.OP_0_16(1n); // a[i]-borrow-b[i]+8 1
        bitcoin.OP_ELSE(); // a[i]-borrow-b[i]
        bitcoin.OP_0_16(0n); // a[i]-borrow-b[i] 0
        bitcoin.OP_ENDIF();

        // hack
        stack.pop();
        stack[stack.length - 1].value = flag;
        if (!flag) stack[stack.length - 2].value -= 8n;

        if (i + 1 < a.length) bitcoin.OP_TOALTSTACK(); // a[i]-borrow-b[i]
        bitcoin.replaceWithTop(a[i]); //
    }

    if (savedA - savedB != nibblesToBigintLS(a))
        teaPot();
}

function naiiveMult(bitcoin: Bitcoin, a: StackItem[], b: StackItem[]): StackItem[] {

    if (a.length != b.length)
        teaPot();

    const result = bitcoin.newNibblesFast(a.length + b.length);

    for (let i = 0; i < a.length; i++) {
        bitcoin.OP_0_16(0n);
        bitcoin.OP_TOALTSTACK();

        for (let j = 0; j < b.length; j++) {
            nibbleMult(bitcoin, a[i], b[j])
            bitcoin.OP_FROMALTSTACK();
            bitcoin.OP_ADD();
            bitcoin.pick(result[i + j]);
            bitcoin.OP_ADD();
            bitcoin.OP_DUP();
            bitcoin.tableFetchInStack(breakTableCarry);
            bitcoin.OP_TOALTSTACK();
            bitcoin.tableFetchInStack(breakTableValue);
            bitcoin.replaceWithTop(result[i + j]);
        }
        bitcoin.OP_FROMALTSTACK();
        bitcoin.replaceWithTop(result[i + b.length]);
    }

    if (nibblesToBigintLS(a) * nibblesToBigintLS(b) != nibblesToBigintLS(result))
        teaPot();

    return result;
}

function karatsubaMult(bitcoin: Bitcoin, a: StackItem[], b: StackItem[], maxDepth: number): StackItem[] {

    if (a.length != b.length)
        teaPot();

    if (maxDepth == 0) return naiiveMult(bitcoin, a, b);

    const origA = nibblesToBigintLS(a);
    const origB = nibblesToBigintLS(b);

    const l = Math.floor(a.length / 2);

    const t1a = a.slice(l);
    const t1b = b.slice(l);
    const t2a = a.slice(0, l);
    const t2b = b.slice(0, l);

    const m2 = maxDepth > 1 ? karatsubaMult(bitcoin, t1a, t1b, maxDepth - 1) : naiiveMult(bitcoin, t1a, t1b);
    const m0 = maxDepth > 1 ? karatsubaMult(bitcoin, t2a, t2b, maxDepth - 1) : naiiveMult(bitcoin, t2a, t2b);

    const t3a = add(bitcoin, t1a, t2a);
    const t3b = add(bitcoin, t1b, t2b);

    const m1 = maxDepth > 1 ? karatsubaMult(bitcoin, t3a, t3b, maxDepth - 1) : naiiveMult(bitcoin, t3a, t3b);

    bitcoin.drop(t3a);
    bitcoin.drop(t3b);

    subtractFromA(bitcoin, m1, m0);
    subtractFromA(bitcoin, m1, m2);

    const result: StackItem[] = [];

    for (let i = 0; i < m0.length; i++) {
        result[i] = m0[i];
    }

    for (let i = 0; i < m2.length; i++) {
        result[2 * l + i] = m2[i];
    }

    for (let i = 0; i < m1.length; i++) {
        bitcoin.add(result[l + i], result[l + i], m1[i]);
    }

    bitcoin.drop(m1);

    for (let i = l; i < result.length; i++) {
        bitcoin.pick(result[i]);

        if (i == l) {
            bitcoin.OP_0_16(0n); // 0
        } else {
            bitcoin.OP_FROMALTSTACK();
        }

        bitcoin.OP_ADD();
        if (i + 1 < result.length) {
            bitcoin.OP_DUP();
            bitcoin.tableFetchInStack(breakTableCarry);
            bitcoin.OP_TOALTSTACK();
        }
        bitcoin.tableFetchInStack(breakTableValue);
        bitcoin.replaceWithTop(result[i]);
    }

    const c = nibblesToBigintLS(result);
    if (origA * origB != c)
        teaPot();

    return result;
}

function verifyEqual(bitcoin: Bitcoin, a: StackItem[], b: StackItem[]) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i]) bitcoin.pick(a[i]);
        else bitcoin.OP_0_16(0n);
        if (b[i]) bitcoin.pick(b[i]);
        else bitcoin.OP_0_16(0n);
        bitcoin.OP_NUMEQUALVERIFY();
    }
}

function checkEqual(a: StackItem[], b: number[]): boolean {
    let flag = true;
    for (let i = 0; i < a.length; i++) {
        if ((b[i] ?? 0) != (Number(a[i]?.value ?? 0n)))
            flag = false;
    }
    return flag;
}

/*** test   ***/

function bigRandom(level: number): bigint {
    let n = 0n;
    for (let i = 0; i < level; i++) {
        n = n + BigInt(Math.round(100 * Math.random()));
        n = n * 100n;
    }
    return n % (2n ** 256n - 1n);
}

function initTables(bitcoin: Bitcoin) {
    tableRow = [];
    for (let i = 0; i < 8; i++) {
        tableRow[i] = bitcoin!.hardcode(BigInt(i * 8), 1);
    }

    table = [];
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++)
            table[i * 8 + j] = bitcoin!.hardcode(BigInt(i * j), 1);
    }

    breakTableValue = [];
    for (let i = 0; i < 64; i++) {
        breakTableValue[i] = bitcoin!.hardcode(BigInt(i & 7), 1);
    }

    breakTableCarry = [];
    for (let i = 0; i < 64; i++) {
        breakTableCarry[i] = bitcoin!.hardcode(BigInt(i >> 3), 1);
    }
}

function verifyMulMod(bitcoin: Bitcoin, a: bigint, b: bigint, c: bigint, d: bigint) {

    const stack = bitcoin.stack.items;

    const w_a = addWitness(bitcoin, bigintToNibblesLS(a, 86));
    const w_b = addWitness(bitcoin, bigintToNibblesLS(b, 86));
    const w_p = addWitness(bitcoin, bigintToNibblesLS(prime_bigint, 86));
    const w_d = addWitness(bitcoin, bigintToNibblesLS(d, 86));
    const w_c = addWitness(bitcoin, bigintToNibblesLS(c, 86));

    const m = karatsubaMult(bitcoin, w_a, w_b, 1);
    console.log('m: ', nibblesToBigintLS(m));
    bitcoin.drop(w_a);
    bitcoin.drop(w_b);
    let t = karatsubaMult(bitcoin, w_p, w_d, 1);
    console.log('t: ', nibblesToBigintLS(t));
    bitcoin.drop(w_p);
    bitcoin.drop(w_d);
    t = add(bitcoin, t, w_c);
    console.log('t: ', nibblesToBigintLS(t));

    verifyEqual(bitcoin, t, m);
}

function test() {

    {
        const bitcoin = new Bitcoin();
        const a = bigRandom(256);
        const b = bigRandom(256);
        const c = a * b;
        const w_a = addWitness(bitcoin, bigintToNibblesLS(a, 86));
        const w_b = addWitness(bitcoin, bigintToNibblesLS(b, 86));

        initTables(bitcoin);

        const result = karatsubaMult(bitcoin, w_a, w_b, 3);

        const f = checkEqual(result, bigintToNibblesLS(c));
        console.log(a, b, c, f);
        console.log('karatsuba     script: ', bitcoin!.programSizeInBitcoinBytes(), '   stack: ', bitcoin!.maxStack);

        assert(f);
    }

    {
        const bitcoin = new Bitcoin();
        const a = bigRandom(256);
        const b = bigRandom(256);
        const c = a * b;
        const w_a = addWitness(bitcoin, bigintToNibblesLS(a, 86));
        const w_b = addWitness(bitcoin, bigintToNibblesLS(b, 86));

        initTables(bitcoin);

        const result = naiiveMult(bitcoin, w_a, w_b);

        const f = checkEqual(result, bigintToNibblesLS(c));
        console.log(a, b, c, f);
        console.log('naiive        script: ', bitcoin!.programSizeInBitcoinBytes(), '   stack: ', bitcoin!.maxStack);
        assert(f);
    }

    {
        const bitcoin = new Bitcoin();
        const a = bigRandom(256);
        const b = bigRandom(256);
        const c = a * b % prime_bigint;
        const d = a * b / prime_bigint;
        initTables(bitcoin);
        
        verifyMulMod(bitcoin, a, b, c, d);

        // console.log('m: ', a * b);
        // console.log('p * d + c: ', prime_bigint * d + c);

        console.log('verifyMulMod   script: ', bitcoin!.programSizeInBitcoinBytes(), '   stack: ', bitcoin!.maxStack);
        console.log('success: ', bitcoin.success);
    }
}

var scriptName = __filename;
if (process.argv[1] == scriptName) {
    test();
}
