
export function modInverse(a: bigint, m: bigint): bigint {
    // validate inputs
    a = (a % m + m) % m;
    if (!a || m < 2) {
        throw new Error("NaN error");
    }
    // find the gcd
    const s = [];
    let b = m;
    while (b) {
        [a, b] = [b, a % b];
        s.push({ a, b });
    }
    if (a !== 1n) {
        throw new Error("NaN error");
    }
    // find the inverse
    let x = 1n;
    let y = 0n;
    for (let i = s.length - 2; i >= 0; --i) {
        [x, y] = [y, x - y * (s[i].a / s[i].b)];
    }
    return (y % m + m) % m;
}

export function mod(a: bigint, m: bigint) { 
    return (a % m + m) % m;
}

export function multiplyComplex(a: bigint[], b: bigint[], m: bigint): bigint[] {
    return [
        mod(a[0] * b[0] - a[1] * b[1], m),
        mod(a[0] * b[1] + a[1] * b[0], m)
    ];
}

export function divideComplex(a: bigint[], b: bigint[], m: bigint): bigint[] {

    if (b[0] === 0n && b[1] === 0n) {
        throw new Error("NaN error");
    }

    const conjugateB = [b[0], mod(-b[1], m)];
    const numerator = multiplyComplex(a, conjugateB, m);
    const modulusSquared = mod(b[0] * b[0] + b[1] * b[1], m);
    return [
        mod(numerator[0] * modInverse(modulusSquared, m), m),
        mod(numerator[1] * modInverse(modulusSquared, m), m)
    ];
}
