import { R_1 } from "./registers";
import { VM } from "./vm";

const p = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const a = 0x0000000000000000000000000000000000000000000000000000000000000000n;
const b = 0x0000000000000000000000000000000000000000000000000000000000000007n;

export class Example {

    vm: VM = new VM(p, 0n);

    mul1(r_target: number, r_a: number, r_b: number) {
        this.vm.enterFunction();

        const r_result = this.vm.allocateRegister();

        const r_temp_1 = this.vm.allocateRegister();
        this.vm.mov(r_temp_1, r_a);

        const r_temp_2 = this.vm.allocateRegister();

        for(let bit = 0; bit < 256; bit++) {
            this.vm.andbit(r_temp_2, r_b, bit, r_temp_1);
            this.vm.add1(r_result, r_result, r_temp_2);
            this.vm.add1(r_temp_1, r_temp_1, r_temp_1);
        }

        this.vm.mov(r_target, r_result);

        this.vm.exitFunction();
    }

    inverse1(r_target: number, r: number) {
        this.vm.enterFunction();

        const v = modInverse(this.vm.getRegister(r), p) as bigint;

        const r_v =  this.vm.allocateRegister();
        this.vm.load(r_v, v, 'inverse1');

        this.vm.mov(r_target, r_v);

        const r_r =  this.vm.allocateRegister();
        this.mul1(r_r, r, r_v);
        this.vm.mov(R_1, r_r);

        this.vm.exitFunction();
    }

    doubleEcPoint(r_targetX: number, r_targetY: number, r_x: number, r_y: number) {
        this.vm.enterFunction();

        // xsqr = x^2
        const r_xsqr = this.vm.allocateRegister();
        this.mul1(r_xsqr, r_x, r_x);

        // m1 = 3*x^2 + a
        const r_m1 = this.vm.allocateRegister();
        this.vm.add1(r_m1, r_xsqr, r_xsqr);
        this.vm.add1(r_m1, r_m1, r_xsqr);
        const r_a = this.vm.allocateRegister();
        this.vm.load(r_a, a, 'a');
        this.vm.add1(r_m1, r_m1, r_a);

        // m2 = 2y
        const r_m2 = this.vm.allocateRegister();
        this.vm.add1(r_m2, r_y, r_y);

        // m2inv = 1 / m2
        const r_m2Inv = this.vm.allocateRegister();
        this.inverse1(r_m2Inv, r_m2);

        // l = m1 * m2inv = (3*x^2 + a) / (2*y)
        const r_l = this.vm.allocateRegister();
        this.mul1(r_l, r_m1, r_m2Inv);

        // x2 = l^2 - 2*x
        this.mul1(r_targetX, r_l, r_l);
        this.vm.sub1(r_targetX, r_targetX, r_x);
        this.vm.sub1(r_targetX, r_targetX, r_x);

        // y2 = l * (x - x2) - y
        this.vm.sub1(r_targetY, r_x, r_targetX);
        this.mul1(r_targetY, r_targetY, r_l);
        this.vm.sub1(r_targetY, r_targetY, r_y);

        this.vm.exitFunction();
    }

    assertEcPoint(r_x: number, r_y: number) {
        this.vm.enterFunction();

        // y^2 = x^3 + a*x + b

        const r_a = this.vm.allocateRegister();
        this.vm.load(r_a, a, 'a');

        const r_b = this.vm.allocateRegister();
        this.vm.load(r_b, b, 'b');

        const r_x_3 = this.vm.allocateRegister();
        this.mul1(r_x_3, r_x, r_x);
        this.mul1(r_x_3, r_x_3, r_x);

        const r_ax = this.vm.allocateRegister();
        this.mul1(r_ax, r_a, r_x);

        const r_total = this.vm.allocateRegister();
        this.vm.add1(r_total, r_b, r_ax);
        this.vm.add1(r_total, r_total, r_x_3);

        const r_ysq = this.vm.allocateRegister();
        this.mul1(r_ysq, r_y, r_y);

        this.vm.assertEq(r_ysq, r_total);
 
        this.vm.exitFunction();
    }

    example() {

        const x = 0x0C6047F9441ED7D6D3045406E95C07CD85C778E4B8CEF3CA7ABAC09B95C709EE5n;
        const y = 0x1AE168FEA63DC339A3C58419466CEAEEF7F632653266D0E1236431A950CFE52An;

        const r_x = this.vm.allocateRegister();
        this.vm.load(r_x, x, 'x');

        const r_y = this.vm.allocateRegister();
        this.vm.load(r_y, y, 'y');

        this.assertEcPoint(r_x, r_y);

        const r_2_x = this.vm.allocateRegister();
        const r_2_y = this.vm.allocateRegister();
        this.doubleEcPoint(r_2_x, r_2_y, r_x, r_y);

        this.assertEcPoint(r_2_x, r_2_y);

        this.vm.print();
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
  