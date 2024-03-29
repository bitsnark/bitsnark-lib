import { Register } from "../register";
import { vm } from "../vm";
import { EmptyMember, Member } from "./member";

export class ECPoint {

    x: Member = new EmptyMember();
    y: Member = new EmptyMember();
}

export class EC {

    constructor(private ec_a: Member, private ec_b: Member) {
    }

    double(a: ECPoint): ECPoint {
        // xsqr = x^2
        const xsqr = a.x.mul(a.x);
        // m1 = 3*x^2 + a
        const m1 = xsqr.add(xsqr).add(xsqr).add(this.ec_a);
        // m2 = 2y
        const m2 = a.y.add(a.y);
        // l = m1 * m2inv = (3*x^2 + a) / (2*y)
        const l = m1.div(m2);
        const result = new ECPoint();
        // x2 = l^2 - 2*x
        result.x = l.mul(l).sub(a.x.add(a.x));
        // y2 = l * (x - x2) - y
        result.y = l.mul(a.x.sub(result.x)).sub(a.y);
        return result;
    }

    add(a: ECPoint, b: ECPoint): ECPoint {
        // m1 = y2 - y1
        const m1 = b.y.sub(a.y);
        // m2 = x2 - x1
        const m2 = b.x.sub(a.x);
        // l = m1 / m2
        const l = m1.div(m2);
        const result = new ECPoint();
        // x2 = l^2 - x1 - x2
        result.x = l.mul(l).sub(a.x).sub(b.x);
        // y2 = l * (x1 - x3) - y1
        result.y = l.mul(a.x.sub(result.x)).sub(a.y);
        return result;
    }

    mul(a: ECPoint, b: Register): ECPoint {
        const result = new ECPoint();
        let agg = a;
        for (let bit = 0; bit < 256; bit++) {
            const cond = this.add(result, agg);
            result.x = cond.x.ifBit(b, bit, result.x);
            result.y = cond.y.ifBit(b, bit, result.y);
            if(bit < 255) agg = this.double(agg);
        }
        return result;
    }

    assertPoint(a: ECPoint) {
        // y^2 = x^3 + a*x + b
        let t1 = a.x.mul(a.x).mul(a.x);
        t1 = t1.add(a.x.mul(this.ec_a));
        t1 = t1.add(this.ec_b);
        const t2 = a.y.mul(a.y);
        console.log(t1, t2);
        const f: Register = t1.eq(t2);
        vm.assertEqOne(f);
    }
}
