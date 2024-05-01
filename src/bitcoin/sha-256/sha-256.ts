import { step1, step2, step3, step4, step5, step6 } from "./steps";
import { add, addHardcoded, bitcoin, dropBits, makeBits, Word } from "./word";

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

function initialize(data: bigint[]): Word[] {
    return data.map(v => new Word(v));
}

function bigIntToWords(n: bigint, count: number): Word[] {
    const words = [];
    let binString = n.toString(2);
    while (binString.length % 8 != 0) binString = '0' + binString;
    let bits = ''
    for (let i = 0; i < binString.length; i++) {
        const b = Number(binString[i]);
        bits = bits + String(b);
        if(bits.length == 32) {
            words.push(Word.fromBinary(bits));
            bits = '';
        }
    }
    if (words.length > count) throw new Error('Too big');
    while (words.length < count) words.push(new Word(0n));
    return words;
}

export function verifyHash(msg: bigint, hash: bigint): boolean {

    const w: Word[] = bigIntToWords(msg, 64);
    const out: Word[] = bigIntToWords(hash, 8);

    const [h0, h1, h2, h3, h4, h5, h6, h7] = initialize(h_hex);
    const s0 = new Word();
    const s1 = new Word();
    const ch = new Word();
    const s0_1 = new Word();
    const temp1 = new Word();
    const temp2 = new Word();
    const m = new Word();
    const a = new Word(h0.toNumber());
    const b = new Word(h1.toNumber());
    const c = new Word(h2.toNumber());
    const d = new Word(h3.toNumber());
    const e = new Word(h4.toNumber());
    const f = new Word(h5.toNumber());
    const g = new Word(h6.toNumber());
    const h = new Word(h7.toNumber());

    for (let i = 16; i < 64; i++) {
        step1(s0, w[i - 15]);
        step2(s1, w[i - 2]);

        add(w[i], w[i - 16], s0);
        add(w[i], w[i], w[i - 7]);
        add(w[i], w[i], s1);

        //console.log('[' + w.map(tw => tw.toPyString()).join(', ') + ']');
        console.log(i);
    }

    for (let j = 0; j < 64; j++) {

        const aBits = makeBits(a);
        const eBits = makeBits(e);

        step3(s1, eBits);
        step4(s0, aBits);
        step5(ch, eBits, f, g);
        step6(m, aBits, b, c);
        
        dropBits(aBits);
        dropBits(eBits);

        add(temp2, s0, m);

        add(s0_1, h, s1);
        add(s0_1, s0_1, ch);
        addHardcoded(s0_1, s0_1, k_hex[j]);
        add(temp1, s0_1, w[j]);

        h.set(g);
        g.set(f);
        f.set(e);
        add(e, d, temp1);
        d.set(c);
        c.set(b);
        b.set(a);
        add(a, temp1, temp2);

        console.log(j);
    }

    add(h0, h0, a)
    add(h1, h1, b)
    add(h2, h2, c)
    add(h3, h3, d)
    add(h4, h4, e)
    add(h5, h5, f)
    add(h6, h6, g)
    add(h7, h7, h)

    console.log('Result: ', [h0, h1, h2, h3, h4, h5, h6, h7].map(t => t.toNumber().toString(16)));

    const tf = bitcoin.newStackItem(0);
    for (let i = 0; i < 8; i++) {
        out[i].eq(tf, [h0, h1, h2, h3, h4, h5, h6, h7][i]);
        bitcoin.assertTrue(tf);
    }

    console.log(`Success: ${!bitcoin.failed}   Max stack: ${bitcoin.stack.maxLength}    Opcodes: ${bitcoin.opcodes.length}`);

    return !bitcoin.failed;
}

const chunk = 0x3487578354897345987abbf713298017347dddcca8760987aabbbccdd98798798abbfc987987987abb00ccd98798798ffffffbbbc908797987cccdddddaaaaaan;
console.log('chunk: ', chunk);
// let binaryString = chunk.toString(2);
// while (binaryString.length < 512) binaryString = '0' + binaryString;
// console.log('chunk bin: ', binaryString);
const hash =  0x54c3f3d905082f7f3b20538aa7219eb64af6be46b7cbbaa90a779748606b9a5cn;
verifyHash(chunk, hash);
