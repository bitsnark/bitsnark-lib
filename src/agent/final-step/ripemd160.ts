import { createHash } from 'node:crypto';
import { Bitcoin } from "../../generator/step3/bitcoin";
import { StackItem } from "../../generator/step3/stack";
import assert from 'node:assert';
import { bigintToNibblesLS } from '../../agent/final-step/common';

const rmd160_r1 = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
  3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
  1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
  4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13
];

const rmd160_r2 = [
  5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
  6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
  15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
  8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14,
  12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11
];

const rmd160_s1 = [
  11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
  7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
  11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
  11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
  9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6
];

const rmd160_s2 = [
  8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
  9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
  9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
  15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8,
  8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11
];

export type Register = StackItem[];

export class RIPEMD160 {

  bitcoin: Bitcoin = new Bitcoin();

  breakValueTable: StackItem[] = [];
  breakValueTable2bit: StackItem[] = [];
  breakCarryTable: StackItem[] = [];
  andTable: StackItem[] = [];
  xorTable: StackItem[] = [];
  orTable: StackItem[] = [];
  notTable: StackItem[] = [];
  notTable2: StackItem[] = [];

  constructor(bitcoin: Bitcoin) {

    this.bitcoin = bitcoin;

    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        this.andTable[i * 8 + j] = this.bitcoin.newStackItem(BigInt(i & j));
      }
    }
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        this.xorTable[i * 8 + j] = this.bitcoin.newStackItem(BigInt(i ^ j));
      }
    }
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        this.orTable[i * 8 + j] = this.bitcoin.newStackItem(BigInt(i | j));
      }
    }
    for (let i = 0; i < 8; i++) {
      this.notTable[i] = this.bitcoin.newStackItem(BigInt(i ^ 7));
    }
    for (let i = 0; i < 8; i++) {
      this.notTable2[i] = this.bitcoin.newStackItem(BigInt(i ^ 7) & 3n);
    }

    for (let i = 0; i < 16; i++) {
      this.breakValueTable[i] = this.bitcoin.newStackItem(BigInt(i & 7));
    }
    for (let i = 0; i < 16; i++) {
      this.breakValueTable2bit[i] = this.bitcoin.newStackItem(BigInt(i & 3));
    }
    for (let i = 0; i < 16; i++) {
      this.breakCarryTable[i] = this.bitcoin.newStackItem(BigInt(i >> 3));
    }
  }

  public newRegister(n: bigint): Register {
    const na = new Array(11).fill(0).map((_, i) => (n >> (BigInt(i) * 3n)) & 7n);
    return na.map(tn => this.bitcoin.newStackItem(tn));
  }

  public registerToBigint(r: Register): bigint {
    let n = 0n;
    r.forEach((si, i) => n += si.value << BigInt(i * 3));
    if (n >= 2 ** 32) throw new Error('Invaid value');
    return n;
  }

  and(target: Register, x: Register, y: Register) {
    for (let i = 0; i < target.length; i++) {
      this.bitcoin.pick(x[i]);
      this.bitcoin.mul8();
      this.bitcoin.pick(y[i]);
      this.bitcoin.OP_ADD();
      this.bitcoin.tableFetchInStack(this.andTable);
      this.bitcoin.replaceWithTop(target[i]);
    }
  }

  not(target: Register, x: Register) {

    for (let i = 0; i < target.length; i++) {
      this.bitcoin.pick(x[i]);
      if (i + 1 < target.length)
        this.bitcoin.tableFetchInStack(this.notTable);
      else
        this.bitcoin.tableFetchInStack(this.notTable2);
      this.bitcoin.replaceWithTop(target[i]);
    }
  }

  xor(target: Register, x: Register, y: Register) {
    for (let i = 0; i < target.length; i++) {
      this.bitcoin.pick(x[i]);
      this.bitcoin.mul8();
      this.bitcoin.pick(y[i]);
      this.bitcoin.OP_ADD();
      this.bitcoin.tableFetchInStack(this.xorTable);
      this.bitcoin.replaceWithTop(target[i]);
    }
  }

  or(target: Register, x: Register, y: Register) {
    for (let i = 0; i < target.length; i++) {
      this.bitcoin.pick(x[i]);
      this.bitcoin.mul8();
      this.bitcoin.pick(y[i]);
      this.bitcoin.OP_ADD();
      this.bitcoin.tableFetchInStack(this.orTable);
      this.bitcoin.replaceWithTop(target[i]);
    }
  }

  binl_rmd160(x: Register[], len: number): Register[] {

    /* append padding */
    x[(((len + 64) >>> 9) << 4) + 14] = this.newRegister(BigInt(len));
    for (let i = 0; i < 32; i++){
      if (!x[i]) x[i] = this.newRegister(0n)
    } 
    this.or(x[len >> 5], x[len >> 5], this.newRegister(0x80n << (BigInt(len) % 32n)));

    var h0 = this.newRegister(0x67452301n);
    var h1 = this.newRegister(0xefcdab89n);
    var h2 = this.newRegister(0x98badcfen);
    var h3 = this.newRegister(0x10325476n);
    var h4 = this.newRegister(0xc3d2e1f0n);

    for (var i = 0; i < x.length; i += 16) {
      var T: Register;
      var A1 = h0, B1 = h1, C1 = h2, D1 = h3, E1 = h4;
      var A2 = h0, B2 = h1, C2 = h2, D2 = h3, E2 = h4;
      for (var j = 0; j <= 79; ++j) {
        T = this.safe_add(A1, this.rmd160_f(j, B1, C1, D1));
        T = this.safe_add(T, x[i + rmd160_r1[j]]);
        T = this.safe_add(T, this.rmd160_K1(j));
        T = this.safe_add(this.bit_rol(T, rmd160_s1[j]), E1);
        A1 = E1; E1 = D1; D1 = this.bit_rol(C1, 10); C1 = B1; B1 = T;
        T = this.safe_add(A2, this.rmd160_f(79 - j, B2, C2, D2));
        T = this.safe_add(T, x[i + rmd160_r2[j]]);
        T = this.safe_add(T, this.rmd160_K2(j));
        T = this.safe_add(this.bit_rol(T, rmd160_s2[j]), E2);
        A2 = E2; E2 = D2; D2 = this.bit_rol(C2, 10); C2 = B2; B2 = T;
      }
      T = this.safe_add(h1, this.safe_add(C1, D2));
      h1 = this.safe_add(h2, this.safe_add(D1, E2));
      h2 = this.safe_add(h3, this.safe_add(E1, A2));
      h3 = this.safe_add(h4, this.safe_add(A1, B2));
      h4 = this.safe_add(h0, this.safe_add(B1, C2));
      h0 = T;
    }
    return [h0, h1, h2, h3, h4];
  }

  rmd160_f(j: number, x: Register, y: Register, z: Register): Register {

    const result = this.newRegister(0n);
    if (0 <= j && j <= 15) {
      //(x ^ y ^ z)
      this.xor(result, x, y);
      this.xor(result, result, z);
      return result;
    }
    if (16 <= j && j <= 31) {
      // (x & y) | (~x & z)
      this.and(result, x, y);
      const t = this.newRegister(0n);
      this.not(t, x);
      this.and(t, t, x);
      this.or(result, result, t);
      return result;
    }
    if (32 <= j && j <= 47) {
      // (x | ~y) ^ z
      const t = this.newRegister(0n);
      this.not(t, y);
      this.or(t, t, x);
      this.xor(t, t, z);
      return result;
    }
    if (48 <= j && j <= 63) {
      // (x & z) | (y & ~z)
      const t1 = this.newRegister(0n);
      this.and(t1, x, z);
      const t2 = this.newRegister(0n);
      this.not(t2, z);
      this.and(t1, t1, y);
      this.or(result, t1, t2);
      return result;
    }
    if (64 <= j && j <= 79) {
      // x ^ (y | ~z)
      const t = this.newRegister(0n);
      this.not(t, z);
      this.or(t, t, y);
      this.xor(result, t, x);
      return result;
    }
    return result;
  }

  rmd160_K1(j: number): Register {
    return this.newRegister((0 <= j && j <= 15) ? 0x00000000n :
      (16 <= j && j <= 31) ? 0x5a827999n :
        (32 <= j && j <= 47) ? 0x6ed9eba1n :
          (48 <= j && j <= 63) ? 0x8f1bbcdcn :
            (64 <= j && j <= 79) ? 0xa953fd4en :
              0n);
  }

  rmd160_K2(j: number): Register {
    return this.newRegister((0 <= j && j <= 15) ? 0x50a28be6n :
      (16 <= j && j <= 31) ? 0x5c4dd124n :
        (32 <= j && j <= 47) ? 0x6d703ef3n :
          (48 <= j && j <= 63) ? 0x7a6d76e9n :
            (64 <= j && j <= 79) ? 0x00000000n :
              0n);
  }

  safe_add(x: Register, y: Register): Register {

    const target = this.newRegister(0n);
    const tx = this.registerToBigint(x);
    const ty = this.registerToBigint(y);

    for (let i = 0; i < target.length; i++) {
      if (i == 0) {
        this.bitcoin.OP_0_16(0n);
      } else {
        this.bitcoin.OP_FROMALTSTACK();
      }
      this.bitcoin.pick(x[i]);
      this.bitcoin.pick(y[i]);
      this.bitcoin.OP_ADD();
      this.bitcoin.OP_ADD();
      if (i + 1 < target.length) {
        this.bitcoin.OP_DUP();
        this.bitcoin.tableFetchInStack(this.breakCarryTable);
        this.bitcoin.OP_TOALTSTACK();
        this.bitcoin.tableFetchInStack(this.breakValueTable);
        this.bitcoin.replaceWithTop(target[i]);
      } else {
        this.bitcoin.tableFetchInStack(this.breakValueTable2bit);
        this.bitcoin.replaceWithTop(target[i]);
      }
    }

    const tt = this.registerToBigint(target);
    assert((tx + ty) % (2n ** 32n) == tt);

    return target;
  }

  toBitsOnAltstack(x: Register) {

    const stack = this.bitcoin.stack.items;

    for (let i = 10; i >= 0; i--) {

      this.bitcoin.pick(x[i]);

      for (let j = 2; j >= 0; j--) {

        if (i != 10 || j != 2) {
          this.bitcoin.OP_DUP();
          this.bitcoin.DATA(BigInt(1 << j));
          this.bitcoin.OP_GREATERTHANOREQUAL();
          this.bitcoin.OP_TOALTSTACK();
        }

        const t = this.bitcoin.stack.top().value;

        this.bitcoin.OP_DUP();
        this.bitcoin.DATA(BigInt(1 << j));
        this.bitcoin.OP_GREATERTHANOREQUAL();
        this.bitcoin.OP_IF();
        this.bitcoin.DATA(BigInt(1 << j));
        this.bitcoin.OP_SUB();
        this.bitcoin.OP_ENDIF();

        // hack
        this.bitcoin.stack.top().value = t >= (1 << j) ? t - BigInt(1 << j) : t;
      }

      this.bitcoin.OP_DROP();
    }

    const tx = this.registerToBigint(x);
    let s = tx.toString(2); while (s.length < 32) s = '0' + s;
    const tn = this.bitcoin.altStack.slice(-32).join('');
    assert(s == tn);
  }

  mov_hc(target: Register, x: bigint) {
    const xa = bigintToNibblesLS(x, 11);
    target.forEach((t, i) => {
      this.bitcoin.DATA(BigInt(xa[i]));
      this.bitcoin.replaceWithTop(t);
    });
  }

  fromBitsOnAltstack_ROTL(target: Register, bits: number) {

    const stack = this.bitcoin.stack.items;

    this.mov_hc(target, 0n);
    let sourceBit = 0;
    for (let i = 0; i < target.length; i++) {
      for (let j = 0; j < 3; j++) {
        if (i * 3 + j > 32) break;
        let targetBit = (sourceBit + bits) % 32;
        const targetNibble = Math.floor(targetBit / 3);
        targetBit -= targetNibble * 3;
        const targetValue = 1 << targetBit;

        this.bitcoin.OP_FROMALTSTACK();

        const f = this.bitcoin.stack.top().value;
        const t = target[targetNibble].value;

        this.bitcoin.OP_IF();
        this.bitcoin.pick(target[targetNibble]);
        this.bitcoin.DATA(BigInt(targetValue));
        this.bitcoin.OP_ADD();
        this.bitcoin.replaceWithTop(target[targetNibble]);
        this.bitcoin.OP_ENDIF();

        // hack
        target[targetNibble].value = f ? t + BigInt(targetValue) : t;

        sourceBit++;
      }
    }
  }

  bit_rol(x: Register, n: number): Register {

    const target = this.newRegister(0n);

    let s = this.registerToBigint(x).toString(2);
    if (s.length > 32) throw new Error('Invalid value');
    while (s.length < 32) s = '0' + s;
    const t = s.slice(n) + s.slice(0, n);
    const tn = BigInt(`0b${t}`);

    this.toBitsOnAltstack(x);
    this.fromBitsOnAltstack_ROTL(target, n);

    const tt = this.registerToBigint(target);
    assert(tn == tt);

    return target;
  }
}

function rstr2binl(input: Buffer): number[] {
  var output = Array(input.length >> 2);
  for (var i = 0; i < output.length; i++)
    output[i] = 0;
  for (var i = 0; i < input.length * 8; i += 8)
    output[i >> 5] |= (input[i / 8] & 0xFF) << (i % 32);
  return output;
}

/*
 * Convert an array of little-endian words to a string
 */
function binl2rstr(input: number[]): Buffer {
  var output = "";
  for (var i = 0; i < input.length * 32; i += 8)
    output += String.fromCharCode((input[i >> 5] >>> (i % 32)) & 0xFF);
  return Buffer.from(output, 'ascii');
}

const test1 = Buffer.from('102030405060708090102030405060708090102030405060708090102030405060708090');

const h = createHash('RIPEMD160');
const r1 = h.update(test1).digest();
console.log('r1: ', r1.toString('hex'));

const numa: number[] = rstr2binl(test1);
const bitcoin: Bitcoin = new Bitcoin();
bitcoin.stackLimit = false;
const ripemd = new RIPEMD160(bitcoin);
const inRegisters = numa.map(n => ripemd.newRegister(BigInt(n)));
const outRegisters = ripemd.binl_rmd160(inRegisters, numa.length * 32);
const r2 = binl2rstr(outRegisters.map(r => Number(ripemd.registerToBigint(r))));
console.log('r2: ', r2.toString('hex'));
console.log(`max stack: ${bitcoin.maxStack}    size: ${bitcoin.programSizeInBitcoinBytes()}`);
assert(r1 == r2);
