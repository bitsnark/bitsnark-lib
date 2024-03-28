import { EC } from "./ec";

export const PRIME = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
export const EC_A = 0x0000000000000000000000000000000000000000000000000000000000000000n;
export const EC_B = 0x0000000000000000000000000000000000000000000000000000000000000007n;

export class EC_BN128 extends EC {

    constructor() {
        super(PRIME, EC_A, EC_B);
    }
}
