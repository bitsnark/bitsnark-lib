import { ECPoint, ecMul } from "./ec";
import { bitcoin } from "./register";

export const prime_bigint = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;

export function verifyEcHash(m: bigint, h: bigint) {

    m = m % prime_bigint;
    h = h % prime_bigint;

    console.log(`witness: ${bitcoin.witness.length}   stack: ${bitcoin.stack.length()}    opcodes: ${bitcoin.opcodes.length}`);

    const p2 = new ECPoint();

    console.log(`witness: ${bitcoin.witness.length}   stack: ${bitcoin.stack.length()}    opcodes: ${bitcoin.opcodes.length}`);
    
    ecMul(p2, 0n, 3n, m, prime_bigint);

    console.log(`witness: ${bitcoin.witness.length}   stack: ${bitcoin.stack.length()}    opcodes: ${bitcoin.opcodes.length}`);
    
    console.log(p2);

    // const h = new Register(_h);
    // const f = bitcoin.newStackItem();
    // m.eq(f, h);
    // bitcoin.assertTrue(f);

    // console.log(`result: ${f.value}    witness: ${bitcoin.witness.length}   stack: ${bitcoin.stack.length()}    opcodes: ${bitcoin.opcodes.length}`);

    // return !!f.value;
}

verifyEcHash(
    0x54c3f3d905082f7f3b20538aa7219eb64af6be46b7cbbaa90a779748606b9a5cn, 
    0x54c3f3d905082f7f3b20538aa7219eb64af6be46b7cbbaa90a779748606b9a5cn);



