import { Arithmetic } from "./arithmetic";

export class EC extends Arithmetic {

    ec_a: bigint;
    ec_b: bigint;

    constructor(prime: bigint, ec_a: bigint, ec_b: bigint) {
        super(prime);
        this.ec_a = ec_a;
        this.ec_b = ec_b;
    }

    ecDouble(r_targetX: number, r_targetY: number, r_x: number, r_y: number) {
        this.enterFunction();

        // xsqr = x^2
        const r_xsqr = this.allocateRegister();
        this.mul(r_xsqr, r_x, r_x);

        // m1 = 3*x^2 + a
        const r_m1 = this.allocateRegister();
        this.add(r_m1, r_xsqr, r_xsqr);
        this.add(r_m1, r_m1, r_xsqr);
        if(this.ec_a != 0n) {
            const r_a = this.allocateRegister();
            this.load(r_a, this.ec_a, 'a');
            this.add(r_m1, r_m1, r_a);    
        }

        // m2 = 2y
        const r_m2 = this.allocateRegister();
        this.add(r_m2, r_y, r_y);

        // m2inv = 1 / m2
        const r_m2Inv = this.allocateRegister();
        this.inverse(r_m2Inv, r_m2);

        // l = m1 * m2inv = (3*x^2 + a) / (2*y)
        const r_l = this.allocateRegister();
        this.mul(r_l, r_m1, r_m2Inv);

        // x2 = l^2 - 2*x
        this.mul(r_targetX, r_l, r_l);
        this.sub(r_targetX, r_targetX, r_x);
        this.sub(r_targetX, r_targetX, r_x);

        // y2 = l * (x - x2) - y
        this.sub(r_targetY, r_x, r_targetX);
        this.mul(r_targetY, r_targetY, r_l);
        this.sub(r_targetY, r_targetY, r_y);

        this.exitFunction();
    }

    ecAdd_notSame(r_targetX: number, r_targetY: number, r_x1: number, r_y1: number,  r_x2: number, r_y2: number) {
        this.enterFunction();

        // m1 = y2 - y1
        const r_m1 = this.allocateRegister();
        this.sub(r_m1, r_y2, r_y1);

        // m2 = x2 - x1
        const r_m2 = this.allocateRegister();
        this.sub(r_m1, r_x2, r_x1);

        // m2inv = 1 / m2
        const r_m2Inv = this.allocateRegister();
        this.inverse(r_m2Inv, r_m2);

        // l = m1 * m2inv
        const r_l = this.allocateRegister();
        this.mul(r_l, r_m1, r_m2Inv);

        // x2 = l^2 - x1 - x2
        this.mul(r_targetX, r_l, r_l);
        this.sub(r_targetX, r_targetX, r_x1);
        this.sub(r_targetX, r_targetX, r_x2);

        // y2 = l * (x1 - x3) - y1
        this.sub(r_targetY, r_x1, r_targetX);
        this.mul(r_targetY, r_targetY, r_l);
        this.sub(r_targetY, r_targetY, r_y1);

        this.exitFunction();
    }

    ecAdd(r_targetX: number, r_targetY: number, r_x1: number, r_y1: number,  r_x2: number, r_y2: number) {
        this.enterFunction();

        const r_same_x = this.allocateRegister();
        const r_same_y = this.allocateRegister();
        this.ecDouble(r_same_x, r_same_y, r_x1, r_y1);

        const r_diff_x = this.allocateRegister();
        const r_diff_y = this.allocateRegister();
        this.ecAdd_notSame(r_diff_x, r_diff_y, r_x1, r_y1, r_x2, r_y2);
        
        const r_flag = this.allocateRegister();
        this.equal(r_flag, r_x1, r_x2);

        this.ifThenElse(r_targetX, r_flag, r_same_x, r_same_y);
        this.ifThenElse(r_targetY, r_flag, r_diff_x, r_diff_y);

        this.exitFunction();
    }

    ecMul(r_targetX: number, r_targetY: number, r_x: number, r_y: number,  r_n: number) {
        this.enterFunction();

        const r_result_x = this.allocateRegister();
        const r_result_y = this.allocateRegister();

        const r_temp_1_x = this.allocateRegister();
        this.mov(r_temp_1_x, r_x);

        const r_temp_1_y = this.allocateRegister();
        this.mov(r_temp_1_y, r_y);

        const r_temp_2_x = this.allocateRegister();
        const r_temp_2_y = this.allocateRegister();

        for(let bit = 0; bit < 256; bit++) {
            this.andbit(r_temp_2_x, r_n, bit, r_temp_1_x);
            this.andbit(r_temp_2_y, r_n, bit, r_temp_1_y);
            this.ecAdd(r_result_x, r_result_y, r_result_x, r_result_y, r_temp_2_x, r_temp_2_y);
            this.ecDouble(r_temp_1_x, r_temp_1_y, r_temp_1_x, r_temp_1_y);
        }

        this.mov(r_targetX, r_result_x);
        this.mov(r_targetY, r_result_y);

        this.exitFunction();
    }

    ecAssertPoint(r_x: number, r_y: number) {
        this.enterFunction();

        // y^2 = x^3 + a*x + b

        const r_b = this.allocateRegister();
        this.load(r_b, this.ec_a, 'b');

        const r_x_3 = this.allocateRegister();
        this.mul(r_x_3, r_x, r_x);
        this.mul(r_x_3, r_x_3, r_x);

        const r_total = this.allocateRegister();
        this.add(r_total, r_total, r_x_3);

        if(this.ec_a > 0) {
            const r_a = this.allocateRegister();
            this.load(r_a, this.ec_a, 'a');
            const r_ax = this.allocateRegister();
            this.mul(r_ax, r_a, r_x);
            this.add(r_total, r_b, r_ax);
        }

        const r_ysq = this.allocateRegister();
        this.mul(r_ysq, r_y, r_y);

        this.assertEq(r_ysq, r_total);

        this.exitFunction();
    }

    ecYFromX(r_targetY: number, r_x: number) {

        const x = this.getRegister(r_x);
        const v = (x * x * x % this.prime + this.ec_a * x % this.prime + this.ec_b) % this.prime;
        this.load(r_targetY, v, 'ecYFromX');
        this.ecAssertPoint(r_x, r_targetY);
    }
}
