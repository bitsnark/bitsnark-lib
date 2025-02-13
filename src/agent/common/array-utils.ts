export function range(start: number, end: number): number[] {
    return new Array(end - start).fill(0).map((_, i) => i);
}

export function array<T>(count: number, f?: ((i: number) => T) | T): T[] {
    if (f && typeof f == 'function') return new Array(count).fill(0).map((_, i) => (f as (i: number) => T)(i));
    return new Array(count).fill(f);
}

export function last<T>(a: T[]): T {
    return a[a.length - 1];
}

export function first<T>(a: T[]): T {
    return a[0];
}

export function butLast<T>(a: T[]): T[] {
    return a.slice(0, a.length - 1);
}

export function butFirst<T>(a: T[]): T[] {
    return a.slice(1);
}

export function chunk<T>(arr: T[], size: number): T[][] {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}

export function reverse<T>(a: T[]): T[] {
    const r: T[] = [];
    for (let i = 0; i < a.length; i++) r[a.length - 1 - i] = a[i];
    return r;
}
