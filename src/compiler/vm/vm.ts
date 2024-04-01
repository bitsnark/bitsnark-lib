import { R_0, R_1, R_R, Register } from "./register";
import { highestIndex as highestRegister } from "./register";
import { Logger } from 'sitka';
import { Witness } from "./witness";

enum InstrCode {
    ADDMOD = "ADDMOD",
    ANDBIT = "ANDBIT",
    MOV = "MOV",
    EQUAL = "EQUAL",
    NOT = "NOT"
}

interface Instruction {
    name: InstrCode;
    target: number;
    params: number[];
}

const R_P0 = Register.hardcoded(0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn);

export class VM {

    static R_R = R_R;
    static R_0 = R_0;
    static R_1 = R_1;

    logger: Logger;
    witness: Witness;
    instructions: Instruction[] = [];
    current: number = 0;

    constructor() {
        this.logger = Logger.getLogger({ name: this.constructor.name });
        this.witness = new Witness();
    }

    /// *** BASIC OPERATIONS ***

    addWitness(value: bigint, title: string) {
        this.witness.set(this.current, value, title);
    }

    setInstruction(name: InstrCode, target: number, params: number[]) {
        this.instructions[this.current] = { name, target, params };
    }

    print() {
        console.log('*** PROGRAM ***');
        for (let i = 0; i < this.instructions.length; i++) {
            const instr = this.instructions[i];
            console.log(`${i}: ${instr.name} ${instr.target} ${instr.params}`);
        }

        this.witness.print();
        console.log('Highest register index: ', highestRegister);
    }

    /// *** BASIC INSTRUCTIONS *** ///

    add(target: Register, a: Register, b: Register, prime: Register) {
        this.setInstruction(InstrCode.ADDMOD, target.getIndex(), [a.getIndex(), b.getIndex(), prime.getIndex()]);
        let v = (a.getValue() + b.getValue()) % prime.getValue();
        target.setValue(v);

        this.current++;
    }

    andbit(target: Register, a: Register, b: number, c: Register) {
        this.setInstruction(InstrCode.ANDBIT, target.getIndex(), [a.getIndex(), b, c.getIndex()]);
        const v = a.getValue() & (2n ** BigInt(b));
        target.setValue(v ? c.getValue() : 0n);

        this.current++;
    }

    mov(target: Register, a: Register) {
        if (a === R_R) {
            target.setValue(this.witness.get(this.current).value);
        } else {
            target.setValue(a.getValue());
        }

        this.setInstruction(InstrCode.MOV, target.getIndex(), [a.getIndex()]);
        this.current++;
    }

    not(target: Register, a: Register) {
        target.setValue(a.getValue() === 0n ? 1n : 0n);

        this.setInstruction(InstrCode.NOT, target.getIndex(), [a.getIndex()]);
        this.current++;
    }

    equal(target: Register, a: Register, b: Register) {
        target.setValue(a.getValue() === b.getValue() ? 1n : 0n);

        this.setInstruction(InstrCode.EQUAL, target.getIndex(), [a.getIndex(), b.getIndex()]);
        this.current++;
    }

    notEqual(target: Register, a: Register, b: Register) {
        target.setValue(a.getValue() === b.getValue() ? 1n : 0n);

        this.setInstruction(InstrCode.EQUAL, target.getIndex(), [a.getIndex(), b.getIndex()]);
        this.setInstruction(InstrCode.NOT, target.getIndex(), [target.getIndex()]);
        this.current += 2;
    }

    /// *** UTILITY INSTRUCTIONS *** ///

    load(target: Register, value: bigint, title: string) {
        this.addWitness(value, title);
        this.mov(target, VM.R_R);
    }

    sub(target: Register, a: Register, b: Register, prime: Register) {
        const v = (prime.getValue() + a.getValue() - b.getValue()) % prime.getValue();
        this.load(target, v, 'sub');
        const temp = new Register();
        this.add(temp, b, target, prime);
        this.assertEq(temp, a);
    }

    assertEqZero(v: Register) {
        this.mov(R_0, v);
    }

    assertEqOne(v: Register) {
        this.mov(R_1, v);
    }

    assertEq(a: Register, b: Register) {
        const temp = new Register();
        this.equal(temp, a, b);
        this.assertEqOne(temp);
    }

    ifThenElse(target: Register, f: Register, a: Register, b: Register) {
        const t1 = new Register();
        this.andbit(t1, f, 0, a);
        const notF = new Register();
        this.add(notF, f, R_1, R_P0);
        const t2 = new Register();
        this.andbit(t2, notF, 0, a);
        this.add(target, t1, t2, R_P0);
    }

    mul(target: Register, a: Register, b: Register, prime: Register) {
        const agg = new Register();
        this.mov(agg, a);
        const r_temp = new Register();
        this.mov(target, R_0);
        for (let bit = 0; bit < 256; bit++) {
            vm.andbit(r_temp, b, bit, agg);
            vm.add(target, target, r_temp, prime);
            if (bit < 255) vm.add(agg, agg, agg, prime);
        }
    }

    inverse(target: Register, a: Register, prime: Register) {
        let v = 0n;
        try {
            v = modInverse(a.getValue(), prime.getValue()) as bigint;
        } catch (e) {
            // Divide by zero. Return 0 because we can't fail here.
        }
        this.load(target, v, 'inverse');
        const temp = new Register();
        this.mul(temp, a, target, prime);
        this.assertEqOne(temp);
    }

    div(target: Register, a: Register, b: Register, prime: Register) {
        const inv = new Register();
        this.inverse(inv, b, prime);
        this.mul(target, a, inv, prime);
    }
}

export const vm = new VM();

function modInverse(a: bigint, m: bigint): bigint {
    // validate inputs
    a = (a % m + m) % m;
    if (!a || m < 2) {
        throw new Error('NaN 1');
    }
    // find the gcd
    const s = [];
    let b = m;
    while (b) {
        [a, b] = [b, a % b];
        s.push({ a, b });
    }
    if (a !== 1n) {
        throw new Error('NaN 2');
    }
    // find the inverse
    let x = 1n;
    let y = 0n;
    for (let i = s.length - 2; i >= 0; --i) {
        [x, y] = [y, x - y * (s[i].a / s[i].b)];
    }
    return (y % m + m) % m;
}
