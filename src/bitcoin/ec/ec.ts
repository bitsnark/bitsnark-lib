import { EC } from "../../groth16/algebra/ec";
import { modInverse } from "../../groth16/common/math-utils";
import { StackItem } from "../stack";
import { bitcoin, mulMod, Register, subMod, divMod, subHardcoded, addMod } from "./register";

const xsqr = new Register();
const m1 = new Register();
const m2 = new Register();
const l = new Register();
const f = bitcoin.newStackItem();

export class ECPoint {
    x: Register;
    y: Register;

    constructor(x?: bigint, y?: bigint) {
        this.x = new Register(x);
        this.y = new Register(y);
    }

    free() {
        this.x.free();
        this.y.free();
    }
}

function double(target: ECPoint, src: ECPoint, prime: bigint) {

    // const testX = 3n * src.x.toNumber() * src.x.toNumber()

    console.log('ec double 1');
    // xsqr = x^2
    mulMod(xsqr, src.x, src.x, prime);

    console.log('ec double 2');
    // m1 = 3*x^2 + a
    addMod(m1, xsqr, xsqr, prime);

    console.log('ec double 3');
    addMod(m1, m1, xsqr, prime);

    console.log('ec double 4');
    // m2 = 2y
    addMod(m2, src.y, src.y, prime);

    // l = m1 * m2inv = (3*x^2 + a) / (2*y)
    console.log('ec double 5');
    divMod(l, m1, m2, prime);

    // x2 = l^2 - 2*x
    console.log('ec double 6');
    mulMod(target.x, l, l, prime);

    console.log('ec double 7');
    subMod(target.x, target.x, src.x, prime);

    console.log('ec double 8');
    subMod(target.x, target.x, src.x, prime);

    // y2 = l * (x - x2) - y
    console.log('ec double 9');
    subMod(target.y, src.x, target.x, prime);

    console.log('ec double 10');
    mulMod(target.y, target.y, l, prime);

    console.log('ec double 11');
    subMod(target.y, target.y, src.y, prime);
}

function doubleHardcoded(x: bigint, y: bigint, prime: bigint): bigint[] {

    const m1 = 3n * x * x;
    const m2 = 2n * y;
    const l = m1 * modInverse(m2, prime);
    const tx = (prime + (l * l) % prime - (2n * x) % prime) % prime;
    const ty = (prime + (l * ((prime + x - tx) % prime)) % prime - y) % prime;
    return [tx, ty];
}

function add(target: ECPoint, a: ECPoint, b: ECPoint, prime: bigint) {

    console.log('ec add 1');
    // m1 = y2 - y1
    subMod(m1, b.y, a.y, prime);

    console.log('ec add 1');
    // m2 = x2 - x1
    subMod(m2, b.x, a.x, prime);

    console.log('ec add 1');
    // l = m1 / m2
    divMod(l, m1, m2, prime);

    console.log('ec add 2');
    // x2 = l^2 - x1 - x2
    mulMod(target.x, l, l, prime);

    console.log('ec add 3');
    subMod(target.x, target.x, a.x, prime);

    console.log('ec add 4');
    subMod(target.x, target.x, b.x, prime);

    // y2 = l * (x1 - x3) - y1
    console.log('ec add 5');
    subMod(target.y, a.x, target.x, prime);

    console.log('ec add 6');
    mulMod(target.y, target.y, l, prime);

    console.log('ec add 7');
    subMod(target.y, target.y, a.y, prime);
}

function addOrDouble(target: ECPoint, a: ECPoint, b: ECPoint, prime: bigint) {

    a.x.eq(f, b.x);
    bitcoin.ifTrue(f, () => {
        double(target, a, prime);
    }, () => {
        add(target, a, b, prime);
    });
}

export function ecMul(target: ECPoint, pX: bigint, pY: bigint, a: bigint, prime: bigint) {

    if (a === 0n) throw new Error('Zero multiplication');

    target.x.setFrom(new Register(pX));
    target.y.setFrom(new Register(pY));

    a = a - 1n;

    console.log(`witness: ${bitcoin.witness.length}   stack: ${bitcoin.stack.length()}    opcodes: ${bitcoin.opcodes.length}`);

    for (let bit = 0; bit < 272; bit++) {
        console.log(`${bit}   ---    witness: ${bitcoin.witness.length}   stack: ${bitcoin.stack.length()}    opcodes: ${bitcoin.opcodes.length}`);
        const temp = new ECPoint(pX, pY);
        const t = a & 0x1n;
        a = a >> 1n;
        if (t) {
            addOrDouble(target, target, temp, prime);
        }
        [pX, pY] = doubleHardcoded(pX, pY, prime);
        temp.free();
    }
}
