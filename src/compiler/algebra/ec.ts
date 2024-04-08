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

        //const tempEqual = this.double();

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

        // const r = this.x.eq(b.x);
        // const result = new ECPoint(this.curve);
        // result.x = tempEqual.x.if(r, tempNotEqual.x);
        // result.y = tempEqual.y.if(r, tempNotEqual.y);

        // return result;

        return tempNotEqual;
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

    neg(): ECPoint {
        const negate = new ECPoint(this.curve);
        negate.x = this.x;
        negate.y = this.y.neg();
        return negate;
    }

    pairing(a: ECPoint): Member {
        // Initialize result to the neutral element in the target group
        //let result = this.curve.ec_a.one();
        let result = new ECPoint(this.curve).x;

        const primeFieldOrder = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
    
        // Initialize P to the current point
        let P = new ECPoint(this.curve, this.x, this.y);
    
        // Initialize Q to the point on the other curve
        let Q = new ECPoint(a.curve, a.x, a.y);
        //const bitlen = bitLength(primeFieldOrder);
        const ate_loop_count = 64;
        // Perform Miller loop
        for (let i = 0; i < ate_loop_count; i++) {
            // Compute line function
            let line_result = P.line(Q);
    
            // Update result
            result = result.mul(line_result);

            // Double P
            P = P.double();
    
            // Update Q based on the bit of the scalar
            if (testBit(primeFieldOrder, i)) {
                Q = Q.add(a);
            }
        }
    
        return result;
    }
    

    //line function used in miller loop in pairing computation
    line(a: ECPoint): ECPoint {
        const result = new ECPoint(this.curve);
        
        // Change if condition to computing the difference and combine by ifBit(register, bit, other)

        // When P = Q
        if ((this.x == a.x) && (this.y == a.y)) {
            // xsqr = x^2
            const xsqr = this.x.mul(this.x);
            // m1 = 3*x^2 + a
            let m1 = xsqr.add(xsqr).add(xsqr).add(this.curve.ec_a);
            // m2 = 2y
            let m2 = this.y.add(this.y);
            // l = m1 * m2inv = (3*x^2 + a) / (2*y)
            let l = m1.div(m2);
    
            // Compute x3 = l^2 - 2*x1
            let x3 = l.mul(l).sub(this.x.mul(this.x));
    
            // Compute y3 = l * (x1 - x3) - y1
            let y3 = l.mul(this.x.sub(x3)).sub(this.y);
    
            result.x = x3;
            result.y = y3;
        } else {
            // Compute m1 = y2 - y1
            let m1 = a.y.sub(this.y);
            // Compute m2 = x2 - x1
            let m2 = a.x.sub(this.x);
            // Compute l = m1 / m2
            let l = m1.div(m2);
    
            // Compute x3 = l^2 - x1 - x2
            let x3 = l.mul(l).sub(this.x).sub(a.x);
    
            // Compute y3 = l * (x1 - x3) - y1
            let y3 = l.mul(this.x.sub(x3)).sub(this.y);
    
            result.x = x3;
            result.y = y3;
        }
    
        return result;
    }
    
    assertPoint() {
        // y^2 = x^3 + a*x + b
        let t1 = this.x.mul(this.x).mul(this.x);
        if(this.curve.ec_a.eq(this.curve.ec_a.zero()).getValue() === 0n) {
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

function bitLength(n: bigint): number {
    let bitLength = 0;
    while (n > 0n) {
        n >>= 1n;
        bitLength++;
    }
    return bitLength;
}

// Function to test a specific bit of a BigInt
function testBit(n: bigint, bitIndex: number): boolean {
    return (n & (1n << BigInt(bitIndex))) !== 0n;
}