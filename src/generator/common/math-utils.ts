
export function modInverse(a: bigint, m: bigint): bigint {
    // validate inputs
    a = (a % m + m) % m;
    if (!a || m < 2) {
        // NaN, but we can't fail
        return 1n;
    }
    // find the gcd
    const s = [];
    let b = m;
    while (b) {
        [a, b] = [b, a % b];
        s.push({ a, b });
    }
    if (a !== 1n) {
        // NaN, but we can't fail
        return 1n;
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
        // can't fail!
        return [0n, 0n];
    }
    const conjugateB = [b[0], mod(-b[1], m)];
    const numerator = multiplyComplex(a, conjugateB, m);
    const modulusSquared = mod(b[0] * b[0] + b[1] * b[1], m);
    return [
        mod(numerator[0] * modInverse(modulusSquared, m), m),
        mod(numerator[1] * modInverse(modulusSquared, m), m)
    ];
}

export function modPow(base: bigint, expo: bigint, p: bigint): bigint {
    let x = base % p, res = expo & 1n ? x : 1n
    do {
        x = x ** 2n % p
        if (expo & 2n) res = res * x % p
    } while (expo /= 2n)
    return res
}

export function polyDeg(p: bigint[]): number {
    let d = p.length - 1;
    while (d > 0 && p[d] === 0n) d -= 1;
    return d;
}

function polyCat(a: bigint[], b: bigint[]): bigint[] {
    const r = a.map(n => n);
    r.push(...b);
    return r;
}

function polyComplete(a: bigint[], degree: number): bigint[] {
    const r = a.map(n => n);
    while (r.length < degree) r.push(0n);
    return r;
}

export function polyRoundedDiv(a: bigint[], b: bigint[], prime: bigint): bigint[] {
    const dega = polyDeg(a);
    const degb = polyDeg(b);
    const temp = a.map(n => n);
    const o = a.map(() => 0n);
    for (let i = dega - degb; i >= 0; i--) {
        o[i] = (o[i] + temp[degb + i] * modInverse(b[degb], prime)) % prime;
        for (let c = 0; c < degb + 1; c++) {
            temp[c + i] = (prime + temp[c + i] - o[c]) % prime;
        }
    }
    while(o[o.length-1] === 0n) o.pop();
    return o;
}

export function polyInv(coeffs: bigint[], modulus_coeffs: bigint[], degree: number, prime: bigint): bigint[] {
    coeffs = polyComplete(coeffs, degree);
    modulus_coeffs = polyComplete(modulus_coeffs, degree);
    let lm = polyComplete([ 1n ], degree + 1);
    let hm = polyComplete([ 0n ], degree + 1);
    let low = polyCat(coeffs, [ 0n ]);
    let high = polyCat(modulus_coeffs, [ 1n ]);
    let count = 0;
    while (polyDeg(low) > 0) {
        let r = polyRoundedDiv(high, low, prime);
        r = polyComplete(r, degree + 1);
        const nm = hm.map(n => n);
        const _new = high.map(n => n);
        //assert len(lm) == len(hm) == len(low) == len(high) == len(nm) == len(new) == self.degree + 1
        for (let i = 0; i < degree + 1; i++) {
            for (let j = 0; j < degree + 1 - i; j++) {
                nm[i + j] = (prime + nm[i + j] - (lm[i] * r[j]) % prime) % prime;
                _new[i + j] = (prime + _new[i + j] - (low[i] * r[j]) % prime) % prime;
            }
        }
        hm = lm;
        lm = nm;
        high = low;
        low = _new;
        count++; 
    }
    lm.length = degree;
    lm = lm.map(n => (n * modInverse(low[0], prime)) % prime);
    return lm;
}

export function polyMul(a: bigint[], b: bigint[], modulus_coeffs: bigint[], degree: number, prime: bigint): bigint[] {
    b = polyComplete([], degree * 2 - 1);
    for (let i = 0; i < degree; i++) {
        for (let j = 0; j < degree; j++) {
            b[i + j] += a[i] * b[j];
        }
    }
    while (b.length > degree) {
        const exp = b.length - degree - 1;
        const top = b.pop() ?? 0n;
        for (let i = 0; i < degree; i++) {
            b[exp + i] -= top * modulus_coeffs[i];
        }
    }
    return b;
}
