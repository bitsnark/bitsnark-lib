import { taggedHash, cat } from "../encoding/encoding";

export const taprootVersion = 0xc0;
export const SECP256K1_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
export const G = {
    x: 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
    y: 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n,
};

export function getHash(script: Buffer): Buffer {
    return taggedHash('TapLeaf',
        cat([Buffer.from([taprootVersion]), compactSize(script.length), script]));
}

export function combineHashes(left_h: Buffer, right_h: Buffer): Buffer {
    if (right_h.compare(left_h as any) === -1) {
        [left_h, right_h] = [right_h, left_h];
    }
    return taggedHash('TapBranch', Buffer.concat([left_h, right_h]));
}

export function compactSize(l: number): Buffer {
    if (l <= 252) return Buffer.from([l]);
    if (l > 252 && l <= 65535) return Buffer.from([0xfd, l & 0xff, l >> 8]);
    if (l > 65535 && l <= 4294967295) return Buffer.from([0xfe, (l & 0xff), (l >> 8) & 0xff, (l >> 16) & 0xff, (l >> 24) & 0xff]);
    throw new Error('Too big');
}
