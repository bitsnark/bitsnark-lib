import { assert } from "chai";
import { add, and, bitcoin, not, rotr, shr, Word, xor } from "./word"

function fromBin(s: string): bigint {
    let n: bigint = 0n;
    let j = 0;
    for (let i = s.length - 1; i >= 0; i--) {
        if (s.charAt(i) == '1') n += 2n ** BigInt(j);
        j++;
    }
    return n;
}

function toBin(x: Word | bigint): string {
    let n = x instanceof Word ? x.toNumber() : x;
    let s = '';
    for (let i = 0; i < 32; i++) {
        s = s + (n & 1n ? '1' : '0');
        n = n >> 1n;
    }
    return s;
}

{
    bitcoin.reset();
    const w1 = new Word(289n);
    const w2 = new Word(358n);
    const s = new Word();
    add(s, w1, w2);
    assert(s.toNumber() == w1.toNumber() + w2.toNumber(), '289 + 358 = 647');
}

{
    bitcoin.reset();
    const w1 = new Word(fromBin('01011100111111000101010110000101'));
    const expected = fromBin('10100011000000111010101001111010');
    const s = new Word();
    not(s, w1);
    assert(s.toNumber() == expected, 'not');
}

{
    bitcoin.reset();
    const w1 = new Word(fromBin('01011100111111000101010110000101'));
    const w2 = new Word(fromBin('11001101000111001101010001110011'));
    const expected = fromBin('10010001111000001000000111110110');
    const s = new Word();
    xor(s, w1, w2);
    assert(s.toNumber() == expected, 'xor');
}

{
    bitcoin.reset();
    const w1 = new Word(fromBin('01011100111111000101010110000101'));
    const w2 = new Word(fromBin('11001101000111001101010001110011'));
    const expected = fromBin('01001100000111000101010000000001');
    const s = new Word();
    and(s, w1, w2);
    assert(s.toNumber() == expected, 'and');
}

{
    bitcoin.reset();
    const w1 = new Word(fromBin('01011100111111000101010110000101'));
    const expected = fromBin('00000000101110011111100010101011');
    const s = new Word();
    shr(s, w1, 7);
    assert(s.toNumber() == expected, 'shr');
}

{
    bitcoin.reset();
    const w1 = new Word(fromBin('01011100111111000101010110000101'));
    const expected = fromBin('00001010101110011111100010101011');
    const s = new Word();
    rotr(s, w1, 7);
    assert(s.toNumber() == expected, 'rotr');
}
