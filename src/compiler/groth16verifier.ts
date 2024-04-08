import { EC, ECPoint } from "./algebra/ec";
import { Register } from "./vm/register";
import {G1} from "./G1"; 
import { PrimeFieldMember } from "./algebra/prime-field";
import { Member } from "./algebra/member";
import { vm } from "./vm/vm";
import { G3Point } from "./algebra/G3";

export class VerifyingKey {
    alpha_g1: ECPoint; // G1
    beta_g2: ECPoint; // G2
    gamma_g2: ECPoint; // G2
    delta_g2: ECPoint; // G2
    ic: ECPoint[]; // G1[]

    constructor(alpha: ECPoint, beta: ECPoint, gamma: ECPoint, delta: ECPoint, ic_elements: ECPoint[]) {
        this.alpha_g1 = alpha;
        this.beta_g2 = beta;
        this.gamma_g2 = gamma;
        this.delta_g2 = delta;
        this.ic = ic_elements;
    }
    //get_prepared_verifying_key()
}

export class PreparedVerifyingKey {
    vk: VerifyingKey;
    alpha_g1_beta_g2: ECPoint; //G3
    gamma_g2_neg_pc: ECPoint; //G2
    delta_g2_neg_pc: ECPoint; //G2

    constructor(vk: VerifyingKey) {
        this.vk = vk;
        this.alpha_g1_beta_g2 = miller_loop(vk.alpha_g1, vk.beta_g2);
        this.gamma_g2_neg_pc = vk.gamma_g2.neg();
        this.delta_g2_neg_pc = vk.delta_g2.neg();
    }
}

export class Proof {
    a: ECPoint; //G1
    b: ECPoint; //G2
    c: ECPoint; //G1

    constructor(a: ECPoint, b: ECPoint, c: ECPoint) {
        this.a = a;
        this.b = b;
        this.c = c;
    }
}

export class PublicInputs{
    elements: PrimeFieldMember[];
    constructor(elements: PrimeFieldMember[]) {
        this.elements = elements;
    }
}

function groth16_verifier(pvk: PreparedVerifyingKey, proof: Proof, public_inputs: PublicInputs) {
    // Check verifying key
    if (public_inputs.elements.length + 1 !== pvk.vk.ic.length) {
        return new Error("MalformedVerifyingKey");
    }

    //Prepare Verifying Key
    let g_ic = pvk.vk.ic[0];

    for (let i = 0; i < public_inputs.elements.length && i < pvk.vk.ic.length - 1; i++) {
        const b = pvk.vk.ic[i+1];
        g_ic = g_ic.add(b.mul(public_inputs.elements[i].getRegister()));
    }


    const g1_elements = [proof.a, g_ic, proof.c];
    const g2_elements = [proof.b, pvk.gamma_g2_neg_pc, pvk.delta_g2_neg_pc];
    
    //Construct qap using miller loop
    const qap = multi_miller_loop(g1_elements, g2_elements);
    
    //final exponentiation
    const test = final_exponentiation(qap);
    
    // Output true or false
    if (test == pvk.alpha_g1_beta_g2) {
        vm.assertEqOne;
    } 
    else {
        vm.assertEqZero;
    }
}

// Output G3 element 
function multi_miller_loop(g1_elements: ECPoint[], g2_elements: ECPoint[]): ECPoint {
    let result = curve.one(); //one element of G3
    for(let i = 0; i < 3; i++) {
        result.mul(miller_loop(g1_elements[i], g2_elements[i]));
    }
    return result;
}

// Output G3 element
function miller_loop(P: ECPoint, Q: ECPoint): ECPoint {
    let result = curve.one(); // one element of G3

    //Zero-check
    if(P.curve.ec_a.zero() && Q.curve.ec_a.zero()){
        return result;
    }

    let R = Q;
    const ate_loop_count = 64;
    for(let i = 0; i < ate_loop_count; i++ ) {
        result = result.mul(result).mul(line_func(R, R, P));
        R = R.double();
        if (ate_loop_count & (2**i)) {
            result = result.mul(line_func(R, Q, P));
            R = R.add(Q);
        }
    }

    /*const curve_order = 21888242871839275222246405745257275088548364400416034343698204186575808495617n; //q
    const field_modulus = 21888242871839275222246405745257275088696311157297823662689037894645226208583n; //p
    const field_modulus_g3 = 
    // Generate two points in G3
    const Q1: [number, number] = [Math.pow(Q[0], field_modulus), Math.pow(Q[1], field_modulus)];
    const nQ2: [number, number] = [Math.pow(Q1[0], field_modulus), -Math.pow(Q1[1], field_modulus)];
    result = result.mul(line_func(R, Q1, P));
    R = R.add(Q1);
    result = result.mul(line_func(R, nQ2, P));
    return Math.pow(result, (field_modulus ** 12 - 1) / curve_order));*/
    //let Q1 = new G3Point();

    return result;
}

function line_func(P1: ECPoint, P2: ECPoint, T: ECPoint) {
    if(P1.x != P2.x) {
        // m = (y2 - y1) / (x2 - x1)
        const slope = P2.y.sub(P1.y).div(P2.x.sub(P1.x));
        // m * (xt - x1) - (yt - y1)
        return slope.mul(T.x.sub(P1.x)).sub(T.y.sub(P1.y));
    }
    else if(P1.y == P2.y){
        // m = 3 * x1**2 / (2 * y1)
        const xsqr = P1.x.mul(P1.x);
        const m1 = xsqr.add(xsqr).add(xsqr);
        const m2 = P1.y.add(P1.y);
        const slope = m1.div(m2);
        return slope.mul(T.x.sub(P1.x)).sub(T.y.sub(P1.y));
    }
    else {
        // xt - x1
        return T.x.sub(P1.x);
    }
}

function line_func_2(P1: ECPoint, P2: ECPoint, T: ECPoint) {
    const x1 = P1.x;
    const y1 = P1.y;
    const x2 = P2.x;
    const y2 = P2.y;
    const xt = T.x;
    const yt = T.y;

    const notEqualX = x1.sub(x2).zero();
    const equalY = y1.eq(y2);
    const equalX = x1.eq(x2);

    const slope1 = y2.sub(y1).div(x2.sub(x1));
    const xsqr = P1.x.mul(P1.x);
    const m1 = xsqr.add(xsqr).add(xsqr);
    const m2 = P1.y.add(P1.y);
    const slope2 = m1.div(m2);

    const result = notEqualX.mul(equalY.)
    
    const result = notEqualX.mul(ifBit(equalY, 0).mul(slope1.mul(xt.sub(x1)).sub(yt.sub(y1))))
                      .add(ifBit(equalY, 1).mul(slope2.mul(xt.sub(x1)).sub(yt.sub(y1))))
                      .add(ifBit(equalX, 1).mul(xt.sub(x1)));

    return result;
}

/*function final_exponentiation(qap: ECPoint) {
    const curve_order = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
    const field_modulus = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
    const Q1: [number, number] = [Math.pow(Q[0], field_modulus), Math.pow(Q[1], field_modulus)];
    const nQ2: [number, number] = [Math.pow(Q1[0], field_modulus), -Math.pow(Q1[1], field_modulus)];
}*/

//export class millerLoop {
    // Miller Loop Algorithm
    /*static millerLoop(P: ECPoint, Q: ECPoint, curve: G1, n: bigint): bigint {
        let result = Register.hardcoded(1n);

        // Set R to Q
        let R = { ...Q };

        // Convert P to projective coordinates
        const P_proj = {
            x: P.x,
            y: P.y,
            z: BigInt(1),
        };

        // Convert R to projective coordinates
        let R_proj = {
            x: R.x,
            y: R.y,
            z: BigInt(1),
        };

        // Compute bits of n
        const nBinary = n.toString(2);
        for (let i = nBinary.length - 2; i >= 0; i--) {
            const bit = nBinary[i];

            // Double result => result = result ^ {2}
            result **= 2n;
            curve.exp(resu)
            

            if (bit === '1') {
                // Add step
                const numerator = curve.add(curve.double(R_proj), P_proj);
                const denominator = curve.add(curve.double(R_proj), curve.negate(P_proj));
                const lambda = {
                    x: (numerator.x * denominator.z ** 2n) % curve.p,
                    y: (numerator.y * denominator.z ** 3n) % curve.p,
                    z: (numerator.z * denominator.z) % curve.p,
                };
                R_proj = lambda;
                result *= (lambda.x * curve.p ** 2n) % curve.p;
            }
        }
        return result % G1.prime;
    }*/

    /*pairing(P: ECPoint, Q: ECPoint, n: Register, prime: Register) {
        // Initialize result to 1
        let result = new Register();
        result.setValue(1n);
    
        // Miller's loop
        for (let i = n.toString(2).length - 1; i >= 0; i--) {
            // Double result
            let exponent = new Register();
            exponent.setValue(2n);
            vm.exp(result, result, exponent, prime);
    
            // Compute line function
            let lineFunc = this.computeLineFunc(P, Q, prime);
            
            let one = new Register();
            one.setValue(1n);
            let reg_i = new Register();
            reg_i.setValue(1n);
            // Multiply result by line function if current bit of n is 1
            if (n.getValue() & (one << reg_i)) {
                vm.mul(result, result, lineFunc, prime);
            }
        }
    
        // Final exponentiation
        let one = new Register();
        one.setValue(1n);
        vm.exp(result, result, (prime - one) / P.order(), prime);
    
        return result;
    }
    
    computeLineFunc(P: ECPoint, Q: ECPoint, prime: Register) {
        // Compute line function for the given points P and Q
        // This involves finding the slope of the line through P and Q,
        // then evaluating it at another point R
    
        // Assuming the computation of line function returns a register
        let lineFunc = new Register();
        // Compute slope and evaluate at R
        // lineFunc = slope * R.x + constant (in register form)
        // This operation is specific to your implementation and curve equations
    
        return lineFunc;
    }
}
/*testBit(register: Register, bitIndex: number): boolean {
        // Extract the word and bit position
        const wordIndex = Math.floor(bitIndex / 64);
        const bitPosition = bitIndex % 64;
    
        // Check if the bit is set
        return (register.getValue()[wordIndex] & (1n << BigInt(bitPosition))) !== 0n;
    }*/

    /*testBit(register: Register, position: number): boolean {
        // Shift 1 to the left by 'position' to create a mask
        const mask = 1 << position;
        // Use bitwise AND to check if the bit at 'position' is set
        return (register & mask) !== 0;
    }*/

    /*exp(exponent: Register): ECPoint {
        let agg = this as ECPoint;
        // Initialize result to the identity element (0, 0)
        let result = new ECPoint(this.ec_a, this.ec_b);
    
        // Iterate through the bits of the exponent
        for (let bit = 0; bit < 256; bit++) {
            // Double the result for each bit of the exponent
            result = result.double();
    
            // If the current bit of the exponent is 1, multiply the result by the base point
            if (exponent.testBit(bit)) {
                result = result.add(agg);
            }
        }
    
        return result;
    }*/

    // Function to compute the line function
    /*computeLineFunc(P: ECPointG1, Q: ECPointG1, prime: Register): Register {
        // Compute the slope of the line passing through points P and Q
        let slope: Register;
        if (P.x !== Q.x || P.y !== Q.y) {
            // Case when P and Q are distinct points
            //const deltaY = Q.y - P.y;
            const slopeNum = new PrimeFieldMember(prime, Q.y.sub(P.y).getRegister()); 
            //const deltaX = Q.x - P.x;
            const slopeDenom = new PrimeFieldMember(prime, Q.x.sub(P.x).getRegister());
            //const slopeNum = new Register(deltaY);
            //const slopeDenom = new Register(deltaX);
            // Compute the slope using modular inverse
            //const inverseDenom = modInverse(slopeDenom.getRegister().getValue(), prime.getValue());
            //slope = new Register((slopeNum.getValue() * inverseDenom) % p);
            let slope = Register.hardcoded(slopeNum.div(slopeDenom).getRegister().getValue());
        } else {
            // Case when P = Q (tangent line)
            // Use the derivative of the curve equation at point P
            //let three = new Register();
            //three.setValue(3n);
            //let two = new Register();
            //two.setValue(2n);
            //let zero = new Register();
            //zero.setValue(0n);
            //let zero = new PrimeFieldMember(prime, Register.hardcoded(0n));
            let two = new PrimeFieldMember(prime, Register.hardcoded(2n));
            let three = new PrimeFieldMember(prime, Register.hardcoded(3n));
            const nume = P.x.exp(2n).mul(three).add(three);
            //const numerator = 3n * P.x ** 2n + 3n;
            const deno = P.y.mul(two);
            //const denominator = 2n * P.y;
            const slopeNum = new Register(numerator);
            const slopeDenom = new Register(denominator);
            // Compute the slope using modular inverse
            const inverseDenom = modInverse(slopeDenom.getValue(), p);
            slope = new Register((slopeNum.getValue() * inverseDenom) % p);
        }
        // Compute the y-intercept of the line
        // y = mx + b => b = y - mx
        const yIntercept = new Register(P.y - slope.getValue() * P.x);

        // Combine the slope and y-intercept to represent the line function
        return new Register(slope.getValue() * Q.x + yIntercept.getValue());
    }*/

    /*computeLineFunc(P1: ECPoint, Q2: ECPoint, prime: Register): Register { 
        // Compute slope of the line passing through P1 and Q2
        let slope: ECPoint;
    
        if (P1.x === Q2.x && P1.y === Q2.y) {
            // Case when P = Q (tangent line)
            //Point Doubling 
            //Define Registers
            let three = new Register();
            three.setValue(3n);
            let two = new Register();
            two.setValue(2n);
            let zero = new Register();
            zero.setValue(0n);
            // numerator = (3n * P1.x ** 2n + 3n) % prime
            let nume:Member = P1.x.exp(two).mul_reg(three).add_reg(three).mod(prime);    
            //let denominator = (2n * P1.y) % prime 
            let deno:Member = P1.y.mul_reg(two).mod(prime);
            // Compute the slope of the line passing through points P and Q
            slope = new ECPoint (P1.ec_a, P1.ec_b, nume.mul(deno.mod_inverse(prime)).mod(prime));   
        } else {
            // Case when P and Q are distinct points
            // Point addition
            let nume: Member = Q2.y.sub(P1.y).mod(prime);
            let deno: Member = Q2.x.sub(P1.x).mod(prime);
            slope = new ECPoint (P1.ec_a, P1.ec_b, nume.mul(deno.mod_inverse(prime)).mod(prime));
        }
    
        // Evaluate the line equation at Q2
        //let constant = (Q2.y - slope.x * Q2.x) % prime;
        let y_intercept = Q2.y.sub(slope.x).mul(Q2.x).mod(prime);
        //let linefunc_member = new ECPoint (P1.ec_a, P1.ec_b, slope, )

        // Store the slope and constant in a register
        let lineFunc = new Register();
        //lineFunc.setValue([slope, y_intercept]);
    
        return lineFunc;
    }*/

    /*pairing(P: ECPoint, Q: ECPoint, n: Register, prime: Register): Register {
        // Initialize result to 1
        let result = new Register();
        result.setValue(1n);
    
        // Miller's loop
        for (let i = n.getValue().toString(2).length - 1; i >= 0; i--) {
            // Double result
            let exponent = new Register();
            exponent.setValue(2n);
            this.exp(result, result, exponent, prime);
    
            // Compute line function
            let lineFunc = new Register();
            lineFunc.setValue(this.computeLineFunc(P, Q, prime).getValue());
            //let lineFunc = this.computeLineFunc(P, Q, prime);
    
            // Multiply result by line function if current bit of n is 1
            if (n.getValue() & (BigInt(1n) << BigInt(i))) {
                this.mul(result, result, lineFunc, prime);
            }
        }
        let one = new Register();
        one.setValue(1n);
        let temp = new Register();
        this.sub(temp, prime, one, prime);
        const order = new Register();
        //Set the order value correctly
        order.setValue(5n);
        this.div(temp, temp, order, prime);
        // Final exponentiation
        //this.exp(result, result, (prime - one) / P.order(), prime);
        this.exp(result, result, temp, prime);
        return result;
    }*/

    // Function to compute the pairing function using Miller Loop
    /*function pairing(P: ECPoint, Q: ECPoint): Register {
        // Initialize result to 1
        let result = new Register();
        result.setValue(1n);

        // Miller's loop
        for (let i = order.getValue().toString(2).length - 1; i >= 0; i--) {
            // Double result
            let exponent = new Register();
            exponent.setValue(2n);
            exp(result, result, exponent, prime);

            // Compute line function
            let lineFunc = computeLineFunc(P, Q);

            // Multiply result by line function if current bit of n is 1
            if (order.getValue() & (1n << BigInt(i))) {
                mul(result, result, lineFunc, prime);
            }
        }

        // Final exponentiation
        let temp = new Register();
        sub(temp, prime, new Register(1n), prime);
        div(temp, temp, new Register(5n), prime);
        exp(result, result, temp, prime);

        return result;
    }*/