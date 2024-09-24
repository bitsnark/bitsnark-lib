import { Register } from "../../common/register";
import { step1_vm as vm } from "../vm/vm";

interface Member<T> {
    zero(): T;
    one(): T;
    if(r: Register, other: T): T;
    ifBit(r: Register, bit: number, other: Member<T>): T;
    eq(a: T): Register;
    add(a: T): T;
    mul(a: T): T;
    sub(a: T): T;
    div(a: T): T;
    inv(): T;
    neg(): T;
    getRegisters(): Register[];
};

export class ECPoint<T extends Member<T>> {

    curve: EC<T>;
    x: T;
    y: T;
    z: T;
    t: T;

    constructor(curve: EC<T>, x?: T, y?: T, z?: T, t?: T) {
        this.curve = curve;
        this.x = x ? x : curve.ec_a.zero();
        this.y = y ? y : curve.ec_a.zero();
        this.z = z ? z : curve.ec_a.one();
        this.t = t ? t : curve.ec_a.one();
    }

    getRegisters(): Register[] {
        return [this.x, this.y, this.z, this.t ].map(t => t.getRegisters()).flat();
    }

    neg(): ECPoint<T> {
        return this.curve.makePoint(this.x, this.y.neg());
    }

    double(): ECPoint<T> {

        // xsqr = x^2
        const xsqr = this.x.mul(this.x);
        // m1 = 3*x^2 + a
        const m1 = xsqr.add(xsqr).add(xsqr).add(this.curve.ec_a);

        // m2 = 2y
        const m2 = this.y.add(this.y);
        // l = m1 * m2inv = (3*x^2 + a) / (2*y)
        const l = m1.div(m2);
        const result = new ECPoint<T>(this.curve);
        // x2 = l^2 - 2*x
        result.x = l.mul(l).sub(this.x.add(this.x));
        // y2 = l * (x - x2) - y
        result.y = l.mul(this.x.sub(result.x)).sub(this.y);
        return result;
    }

    eq(b: ECPoint<T>): Register {
        const rx = this.y.eq(b.y);
        const ry = this.y.eq(b.y);
        const tr = vm.newRegister();
        vm.and(tr, rx, ry);
        return tr;
    }

    add(b: ECPoint<T>): ECPoint<T> {


        // case where this == b

        const tempEqual = this.double();

        // case where this != a

        const tempNotEqual =  new ECPoint<T>(this.curve);
        vm.ignoreFailure(() => {
            // m1 = y2 - y1
            const m1 = b.y.sub(this.y);
            // m2 = x2 - x1
            const m2 = b.x.sub(this.x);
            // l = m1 / m2
            const l = m1.div(m2);
            // x2 = l^2 - x1 - x2
            tempNotEqual.x = l.mul(l).sub(this.x).sub(b.x);
            // y2 = l * (x1 - x3) - y1
            tempNotEqual.y = l.mul(this.x.sub(tempNotEqual.x)).sub(this.y);
        });

        // combine two cases depending on equality

        const r = this.x.eq(b.x);
        const result = new ECPoint<T>(this.curve);
        result.x = tempEqual.x.if(r, tempNotEqual.x);
        result.y = tempEqual.y.if(r, tempNotEqual.y);

        return result;
    }

    ifBit(r: Register, bit: number, other: ECPoint<T>): ECPoint<T> {
        return this.curve.makePoint(this.x.ifBit(r, bit, other.x), this.y.ifBit(r, bit, other.y));
    }

    mul(a: Register): ECPoint<T> {
        if (a.value === 0n) throw new Error('Zero multiplication');
        let result = this as ECPoint<T>;
        const na = vm.newRegister();
        vm.subMod(na, a, vm.one);
        let agg = this as ECPoint<T>;
        for (let bit = 0; bit < 256; bit++) {
            if (!a.hardcoded) {
                result = result.add(agg).ifBit(na, bit, result);
            } else if (na.value & 2n ** BigInt(bit)) {
                result = result.add(agg);
            }
            if (bit < 255) agg = agg.double();
        }
        return result;
    }

    assertPoint() {
        // y^2 = x^3 + a*x + b
        let t1 = this.x.mul(this.x).mul(this.x);
        if (this.curve.ec_a.eq(this.curve.ec_a.zero()).value === 0n) {
            t1 = t1.add(this.x.mul(this.curve.ec_a));
        }
        t1 = t1.add(this.curve.ec_b);
        const t2 = this.y.mul(this.y);
        const f: Register = t1.eq(t2);
        vm.assertEqOne(f);
    }

    line(p2: ECPoint<T>, t: ECPoint<T>): T {

        const sameX = this.x.eq(p2.x);
        const diffX = vm.newRegister();
        vm.not(diffX, sameX);
        const sameY = this.y.eq(p2.y);
        const diffY = vm.newRegister();
        vm.not(diffY, sameY);
    
        const p1x_2 = this.x.mul(this.x);
    
        let resultSameY;
        let resultDiffX;
    
        vm.ignoreFailureInExactlyOne(
            // x1 != x2
            () => {
                const mDiffX = p2.y.sub(this.y).div(p2.x.sub(this.x));
                resultDiffX = mDiffX.mul(t.x.sub(this.x)).sub(t.y.sub(this.y));
            }, 
            // x1 == x2 && y1 == y2
            () => {
                const mSameX = p1x_2.add(p1x_2).add(p1x_2).div(this.y.add(this.y));
                resultSameY = mSameX.mul(t.x.sub(this.x)).sub(t.y.sub(this.y));
            });
    
        let result = t.x.sub(this.x);
        result = resultSameY!.if(sameY, result);
        result = resultDiffX!.if(diffX, result);
        return result;
    }

    toAffine(): ECPoint<T> {
        const zInv = this.z.inv();
        const t = this.y.mul(zInv);
        const zInv2 = zInv.mul(zInv);
        return new ECPoint<T>(this.curve, this.x.mul(zInv2), t.mul(zInv2), this.x.one(), this.x.one());
    }

    toString(): string {
        return `{ x: ${this.x.toString()}, y: ${this.y.toString()} }`;
    }
}

export abstract class EC<T extends Member<T>> {

    ec_a: T;
    ec_b: T;

    constructor(ec_a: T, ec_b: T) {
        this.ec_a = ec_a;
        this.ec_b = ec_b;
    }

    makePoint(x?: T, y?: T, z?: T, t?: T) {
        return new ECPoint<T>(this, x, y, z, t);
    }
}
