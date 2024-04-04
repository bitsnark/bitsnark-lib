import { Register } from "../vm/state";
import { vm } from "../vm/vm";
import { Member } from "./member";

export class ECPoint {

    curve: EC;

    x: Member;
    y: Member;

    constructor(curve: EC, x?: Member, y?: Member) {
        this.curve = curve;
        this.x = x ? x : curve.ec_a.zero();
        this.y = y ? y : curve.ec_a.zero();
    }

    double(): ECPoint {
        // xsqr = x^2
        const xsqr = this.x.mul(this.x);
        // m1 = 3*x^2 + a
        const m1 = xsqr.add(xsqr).add(xsqr).add(this.curve.ec_a);
        // m2 = 2y
        const m2 = this.y.add(this.y);
        // l = m1 * m2inv = (3*x^2 + a) / (2*y)
        const l = m1.div(m2);
        const result = new ECPoint(this.curve);
        // x2 = l^2 - 2*x
        result.x = l.mul(l).sub(this.x.add(this.x));
        // y2 = l * (x - x2) - y
        result.y = l.mul(this.x.sub(result.x)).sub(this.y);
        return result;
    }

    add(b: ECPoint): ECPoint {

        // case where this == b

        const tempEqual = this.double();

        // case where this != a

        // m1 = y2 - y1
        const m1 = b.y.sub(this.y);
        // m2 = x2 - x1
        const m2 = b.x.sub(this.x);
        // l = m1 / m2
        const l = m1.div(m2);
        // x2 = l^2 - x1 - x2
        const tempNotEqual = new ECPoint(this.curve);
        tempNotEqual.x = l.mul(l).sub(this.x).sub(b.x);
        // y2 = l * (x1 - x3) - y1
        tempNotEqual.y = l.mul(this.x.sub(tempNotEqual.x)).sub(this.y);

        // combine two cases depending on equality

        const r = this.x.eq(b.x);
        const result = new ECPoint(this.curve);
        result.x = tempEqual.x.if(r, tempNotEqual.x);
        result.y = tempEqual.y.if(r, tempNotEqual.y);

        return result;
    }

    mul(a: Register): ECPoint {
        const result = new ECPoint(this.curve);
        let agg = this as ECPoint;
        for (let bit = 0; bit < 256; bit++) {
            const cond = result.add(agg);
            result.x = cond.x.if(a, result.x);
            result.y = cond.y.if(a, result.y);
            if (bit < 255) agg = agg.double();
        }
        return result;
    }

    assertPoint() {
        // y^2 = x^3 + a*x + b
        let t1 = this.x.mul(this.x).mul(this.x);
        if(this.curve.ec_a.eq(this.curve.ec_a.zero()).getValue() != 0n) {
            t1 = t1.add(this.x.mul(this.curve.ec_a));
        }
        t1 = t1.add(this.curve.ec_b);
        const t2 = this.y.mul(this.y);
        const f: Register = t1.eq(t2);
        vm.assertEqOne(f);
    }
}

export class EC {

    ec_a: Member;
    ec_b: Member;

    constructor(ec_a: Member, ec_b: Member) {
        this.ec_a = ec_a;
        this.ec_b = ec_b;
    }

    makePoint(x: Member, y: Member) {
        return new ECPoint(this, x, y);
    }
}
