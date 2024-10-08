const p = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;

interface Point {
    x: bigint;
    y: bigint;
}

function modulus(a: bigint, b: bigint): bigint {
    let result = a % b;
    if (result < 0) {
        return result + b;
    }
    return result;
}

export function modPow(x: bigint, y: bigint, p: bigint): bigint {
    let result = 1n;
    x = modulus(x, p);
    while (y > 0) {
        if (y & 1n) result = modulus(result * x, p);
        y = y >> 1n;
        x = modulus(x * x, p);
    }

    return result;
}

export function lift_x(x: bigint): Point {
    if (x > p) throw new Error("x > p");
    const y_sq = (modPow(x, 3n, p) + 7n) % p;
    const y = modPow(y_sq, (p + 1n) / 4n, p);
    if (modPow(y, 2n, p) !== y_sq) throw new Error("NaN");
    return { x: x, y: (y & 1n) === 0n ? y : p - y };
}

export function hasEvenY(P: Point | null): boolean {
    if (P == null) throw new Error("P is null");
    return P.y % 2n === 0n;
}

export function pointAdd(P1: Point | null, P2: Point | null) {
    if (P1 == null) return P2;
    if (P2 == null) return P1;
    if (P1.x === P2.x && P1.y !== P2.y) return null;

    let lam: bigint;
    if (P1.x === P2.x && P1.y === P2.y) {
        lam = modulus(3n * P1.x * P1.x * modPow(2n * P1.y, p - 2n, p), p);
    } else {
        lam = modulus((P2.y - P1.y) * modPow(P2.x - P1.x, p - 2n, p), p);
    }

    const x3 = modulus(lam * lam - P1.x - P2.x, p);
    return { x: x3, y: modulus(lam * (P1.x - x3) - P1.y, p) };
}

export function pointMul(P: Point | null, n: bigint): Point | null {
    let R = null;
    for (let i = 0; i < 256; i++) {
        if ((n >> BigInt(i)) & 1n) R = pointAdd(R, P);
        P = pointAdd(P, P);
    }
    return R;
}
