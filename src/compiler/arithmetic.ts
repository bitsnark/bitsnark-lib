import { R_1 } from "./registers";
import { VM } from "./vm";

export class Arithmetic extends VM {

    constructor(prime: bigint) {
        super(prime);
    }

    mul(r_target: number, r_a: number, r_b: number) {
        this.enterFunction();

        const r_result = this.allocateRegister();

        const r_temp_1 = this.allocateRegister();
        this.mov(r_temp_1, r_a);

        const r_temp_2 = this.allocateRegister();

        for(let bit = 0; bit < 256; bit++) {
            this.andbit(r_temp_2, r_b, bit, r_temp_1);
            this.add(r_result, r_result, r_temp_2);
            this.add(r_temp_1, r_temp_1, r_temp_1);
        }

        this.mov(r_target, r_result);

        this.exitFunction();
    }

    inverse(r_target: number, r: number) {
        this.enterFunction();

        let v = 0n;
        try {
            v = modInverse(this.getRegister(r), this.prime) as bigint;
        } catch (e) { 
            // Divide by zero. Return 0 because we can't fail here.
        }

        const r_v =  this.allocateRegister();
        this.load(r_v, v, 'inverse1');

        this.mov(r_target, r_v);

        const r_r =  this.allocateRegister();
        this.mul(r_r, r, r_v);
        this.mov(R_1, r_r);

        this.exitFunction();
    }
}

function modInverse(a: bigint, m: bigint): bigint {
    // validate inputs
    a = (a % m + m) % m;
    if (!a || m < 2) {
      throw new Error('NaN 1');
    }
    // find the gcd
    const s = [];
    let b = m;
    while(b) {
      [a, b] = [b, a % b];
      s.push({a, b});
    }
    if (a !== 1n) {
        throw new Error('NaN 2');
    }
    // find the inverse
    let x = 1n;
    let y = 0n;
    for(let i = s.length - 2; i >= 0; --i) {
      [x, y] = [y,  x - y * (s[i].a / s[i].b)];
    }
    return (y % m + m) % m;
  }
  