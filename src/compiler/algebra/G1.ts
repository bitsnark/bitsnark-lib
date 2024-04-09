import { EC, ECPoint } from "./ec";
import { PrimeField, PrimeFieldMember } from "./prime-field";
import { Register } from "../vm/state";
import { vm } from "../vm/vm";

const prime: Register = vm.hardcoded(21888242871839275222246405745257275088696311157297823662689037894645226208583n);
const primeField = new PrimeField(prime);

const two = primeField.newMember(vm.hardcoded(2n));
const three = primeField.newMember(vm.hardcoded(3n));

const gen_x = primeField.newMember(vm.hardcoded(1n));
const gen_y = primeField.newMember(vm.hardcoded(2n));
const ec_a = primeField.newMember(vm.hardcoded(0n));
const ec_b = primeField.newMember(vm.hardcoded(3n));

export class G1Point extends ECPoint {
}

// group over elliptic curve over finite field
export class G1 extends EC {

    primeField = primeField;
    generator: G1Point;

    constructor() {
        super(ec_a, ec_b);
        this.generator = this.makePoint(gen_x, gen_y);
    }

    makePoint(x: PrimeFieldMember, y: PrimeFieldMember): G1Point {
        return new G1Point(this, x, y);
    }

    static line(p1: G1Point, p2: G1Point, t: G1Point): PrimeFieldMember {

        const sameX = p1.x.eq(p2.x);
        const diffX = vm.newRegister();
        vm.not(diffX, sameX);
        const sameY = p1.y.eq(p2.y);
        const diffY = vm.newRegister();
        vm.not(diffY, sameY);
        const sameXDiffY = vm.newRegister();
        vm.and(sameXDiffY, sameX, diffY);

        const mSameX = three.mul(p1.x).mul(p1.x).div(two.mul(p1.y)) as PrimeFieldMember;
        const mDiffX = p2.y.sub(p1.y).div(p2.x.sub(p1.x)) as PrimeFieldMember;
        const resultSameY = mSameX.mul(t.x.sub(p1.x).sub(t.y.sub(p1.y))) as PrimeFieldMember;
        const resultDiffX = mDiffX.mul(t.x.sub(p1.x).sub(t.y.sub(p1.y))) as PrimeFieldMember;
        const resultOther = t.x.sub(p1.x) as PrimeFieldMember;

        const rm = vm.newRegister();
        vm.ifThenElse(rm, diffX, resultDiffX.getRegister(), resultOther.getRegister());
        vm.ifThenElse(rm, sameY, resultSameY.getRegister(), rm);
        return new PrimeFieldMember(rm);
    }
}

export const g1 = new G1();
