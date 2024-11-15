import assert from 'assert';

// const prime = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;

type Nibble = number; // 3 bit integer
type ExtNibble = number; // 6 bit integer
type NibbleSet = Nibble[];

function teaPot() {
    throw new Error("I'm a teapot");
}

function nibblesToBigintLS(s: NibbleSet): bigint {
    let result = 0n;
    for (let i = 0; i < s.length; i++) {
        result += BigInt(s[i]) << (3n * BigInt(i));
    }
    return result;
}

function bigintToNibblesLS(n: bigint, c?: number): NibbleSet {
    const result: NibbleSet = [];
    for (let i = 0; (c && i < c) || (!c && n > 0); i++) {
        result[i] = Number(n & 0x7n);
        n = n >> 3n;
    }
    if (n > 0) teaPot();
    return result;
}

/***   hardcoded    ***/

// const primeNibbles: NibbleSet = bigintToNibblesLS(prime);

const rowTable: Nibble[] = [];
const table: Nibble[] = [];
for (let i = 0; i < 8; i++) {
    rowTable[i] = i * 8;
    for (let j = 0; j < 8; j++) table[rowTable[i] + j] = i * j;
}
const breakTable: Nibble[][] = [];
for (let i = 0; i < 128; i++) breakTable[i] = [i & 7, i >> 3];

/***   arithmetic   ***/

function nibbleMult(a: Nibble, b: Nibble): ExtNibble {
    if (a >= rowTable.length) teaPot();
    if (rowTable[a] + b >= table.length) teaPot();
    return table[rowTable[a] + b];
}

// function smallerThanOrEqual(a: NibbleSet, b: NibbleSet): boolean {
//     let flag = 0;
//     for (let i = Math.max(a.length, b.length); i >= 0; i--) {
//         if (flag == 0 && (a[i] ?? 0) < (b[i] ?? 0)) flag = 1;
//         if (flag == 0 && (a[i] ?? 0) > (b[i] ?? 0)) flag = 2;
//     }
//     return flag != 2;
// }

function add(a: NibbleSet, b: NibbleSet): NibbleSet {
    const result: NibbleSet = [];
    let carry: Nibble = 0;
    const l = Math.max(a.length, b.length);
    for (let i = 0; i < l; i++) {
        const t = carry + (a[i] ?? 0) + (b[i] ?? 0);
        const tt = breakTable[t];
        result[i] = tt[0];
        carry = tt[1];
    }
    result[l] = carry;

    if (nibblesToBigintLS(a) + nibblesToBigintLS(b) != nibblesToBigintLS(result)) teaPot();

    return result;
}

function subtract(a: NibbleSet, b: NibbleSet): NibbleSet {
    const result: NibbleSet = [];
    let borrow: Nibble = 0;
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if ((a[i] ?? 0) >= (b[i] ?? 0) + borrow) {
            result[i] = (a[i] ?? 0) - (b[i] ?? 0) - borrow;
            borrow = 0;
        } else {
            result[i] = 8 + (a[i] ?? 0) - (b[i] ?? 0) - borrow;
            borrow = 1;
        }
    }
    if (borrow > 0) teaPot();

    if (nibblesToBigintLS(a) - nibblesToBigintLS(b) != nibblesToBigintLS(result)) teaPot();

    return result;
}

function naiiveMult(a: NibbleSet, b: NibbleSet): NibbleSet {
    if (a.length != b.length) teaPot();

    const result: NibbleSet = [];
    for (let i = 0; i < a.length; i++) {
        let carry: Nibble = 0;
        for (let j = 0; j < b.length; j++) {
            const t = carry + (result[i + j] ?? 0) + nibbleMult(a[i], b[j]);
            const tt = breakTable[t];
            result[i + j] = tt[0];
            carry = tt[1];
        }
        result[i + b.length] = carry;
    }

    if (nibblesToBigintLS(a) * nibblesToBigintLS(b) != nibblesToBigintLS(result)) teaPot();

    return result;
}

function karatsubaMult(a: NibbleSet, b: NibbleSet): NibbleSet {
    if (a.length != b.length) teaPot();

    if (a.length <= 5 || b.length <= 5) {
        return naiiveMult(a, b);
    }

    const l = Math.floor(a.length / 2);

    const t1a = a.slice(l);
    const t1b = b.slice(l);
    const m2 = karatsubaMult(t1a, t1b);

    const t2a = a.slice(0, l);
    const t2b = b.slice(0, l);
    const m0 = karatsubaMult(t2a, t2b);

    const t3a = add(t1a, t2a);
    const t3b = add(t1b, t2b);
    let m1 = karatsubaMult(t3a, t3b);
    m1 = subtract(m1, m0);
    m1 = subtract(m1, m2);

    const result = new Array(a.length + m2.length).fill(0);
    for (let i = 0; i < m0.length; i++) result[i] = m0[i];

    for (let i = 0; i < m2.length; i++) {
        result[2 * l + i] += m2[i];
    }
    for (let i = 0; i < m1.length; i++) {
        result[l + i] += m1[i];
    }
    for (let i = l; i < result.length - 1; i++) {
        const tt = breakTable[result[i]];
        result[i] = tt[0];
        result[i + 1] = (result[i + 1] ?? 0) + tt[1];
    }

    if (nibblesToBigintLS(a) * nibblesToBigintLS(b) != nibblesToBigintLS(result)) teaPot();

    return result;
}

function checkEqual(a: NibbleSet, b: NibbleSet): boolean {
    let flag = true;
    for (let i = 0; i < a.length; i++) {
        if ((b[i] ?? 0) != (a[i] ?? 0)) flag = false;
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
    return n % (2n ** 128n - 1n);
}

// const a = 357n;
// const b = 632n;
// const c = a * b;
// const f = checkEqual(
//     karatsubaMult(bigintToNibblesLS(a, 4), bigintToNibblesLS(b, 4)),
//     bigintToNibblesLS(c));
// console.log(a, b, c, f);

for (let i = 1; i < 128; i++) {
    const a = bigRandom(i);
    const b = bigRandom(i);
    const c = a * b;
    const f = checkEqual(karatsubaMult(bigintToNibblesLS(a, 128), bigintToNibblesLS(b, 128)), bigintToNibblesLS(c));
    console.log(i, a, b, c, f);
    assert(f);
}
