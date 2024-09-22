import assert from "assert";

// const prime = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;

type Nibble = number; // 3 bit integer
type ExtNibble = number; // 6 bit integer
type NibbleSet = Nibble[];

function teaPot() {
    throw new Error("I'm a teapot");
}

function bigintToNibblesLS(n: bigint, c?: number): NibbleSet {
    const result: NibbleSet = [];
    for (let i = 0; (c && i < c) || (!c && n > 0); i++) {
        result[i] = Number(n & 0x7n);
        n = n >> 3n;
    }
    if (n > 0)
        teaPot();
    return result;
}

/***   hardcoded    ***/

// const primeNibbles: NibbleSet = bigintToNibblesLS(prime);

const rowTable: Nibble[] = [];
const table: Nibble[] = [];
for (let i = 0; i < 8; i++) {
    rowTable[i] = i * 8;
    for (let j = 0; j < 8; j++)
        table[rowTable[i] + j] = i * j;
}
const breakTable: Nibble[][] = [];
for (let i = 0; i < 64; i++) breakTable[i] = [ i & 7, i >> 3 ];

/***   multiply   ***/

function nibbleMult(a: Nibble, b: Nibble): ExtNibble {
    // if (a >= rowTable.length) teaPot();
    // if (rowTable[a] + b >= table.length) teaPot();
    // return table[rowTable[a] + b];
    return a * b;
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
    console.log('add', a, b);
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
    return result;
}  

function subtract(a: NibbleSet, b: NibbleSet): NibbleSet {
    console.log('sub', a, b);
    const result: NibbleSet = [];
    let borrow: Nibble = 0;
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if ((a[i] ?? 0) >= (b[i] ?? 0) + borrow) {
            result[i] = (a[i] ?? 0) - (b[i] ?? 0) - borrow;
            borrow = 0;
        } else {
            result[i] = 8 + (a[i] ?? 0) - (b[i] ?? 0);
            borrow = 1;
        }
    }
    if (borrow > 0)
        teaPot();
    return result;
}

function naiiveMult(a: NibbleSet, b: NibbleSet): NibbleSet {
    let result: NibbleSet = [];
    let carry: ExtNibble = 0;
    for (let i = 0; i < a.length; i++) {
        for (let j = 0; j < b.length; j++) {
            carry = carry + (result[i + j] ?? 0) + nibbleMult(a[i], b[j]);
            if (carry >= 64) 
                teaPot();
            const tt = breakTable[carry];
            result[i + j] = tt[0];
            carry = tt[1];
        }
    }
    result[a.length + b.length - 1] = carry;
    return result;
}

function karatsubaMult(a: NibbleSet, b: NibbleSet): NibbleSet {
    
    if (a.length <= 3 || b.length <= 3) {
        return naiiveMult(a, b);
    }

    const l = Math.floor(a.length / 2);

    const t1a = a.slice(l);
    const t1b = b.slice(l);
    const m1 = karatsubaMult(t1a, t1b);

    const t2a = a.slice(0, l);
    const t2b = b.slice(0, l);
    const m2 = karatsubaMult(t2a, t2b);

    const t3a = add(t1a, t1b);
    const t3b = add(t2a, t2b);
    let m3 = karatsubaMult(t3a, t3b);
    m3 = subtract(m3, m1);
    m3 = subtract(m3, m2);

    return [ ...m1, ...m3, ...m2];
}

function checkEqual(a: NibbleSet, b: NibbleSet): boolean {
    let flag = true;
    for (let i = 0; i < a.length; i++) {
        if ((b[i] ?? 0) != (a[i] ?? 0)) 
            flag = false;
    }
    return flag;
}

/*** test   ***/

// function nibblesToBigintLS(s: NibbleSet): bigint {
//     let result = 0n;
//     for (let i = 0; i < s.length; i++) {
//         result += BigInt(s[i]) << (3n * BigInt(i));
//     }
//     return result;
// }

function bigRandom(level: number): bigint {
    let n = 0n;
    for (let i = 0; i < level; i++) {
        n = n + BigInt(Math.round(100 * Math.random()));
        n = n * 100n;
    }
    return n % (2n ** 256n - 1n);
}

const a = 345n;
const b = 876n;
const c = a * b;
const f = checkEqual(
    karatsubaMult(bigintToNibblesLS(a, 4), bigintToNibblesLS(b, 4)), 
    bigintToNibblesLS(c));
console.log(a, b, c, f);

// for (let i = 1; i < 1000; i++) {
//     const a = bigRandom(i);
//     const b = bigRandom(i);
//     const c = a * b;
//     const f = checkEqual(
//         karatsubaMult(bigintToNibblesLS(a, 86), bigintToNibblesLS(b, 86)), 
//         bigintToNibblesLS(c));
//     console.log(a, b, c, f);
//     assert(f);
// }

// cases.forEach((c, i) => {
//     const f = checkEqual(
//         naiiveMult(bigintToNibblesLS(c[0], 86), bigintToNibblesLS(c[1], 87)),
//         bigintToNibblesLS(c[2]));
//     console.log(i, c, f);
//     assert(f);
// });
