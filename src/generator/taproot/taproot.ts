import { bigintFromBytes, bytesFromBigint, padHex, taggedHash } from "../../encoding/encoding";
import { hasEvenY, lift_x, pointAdd, pointMul } from "../../common/point";
import {
    G,
    SECP256K1_ORDER,
    combineHashes,
    compactSize,
    getHash,
    taprootVersion,
} from "../../common/taproot-common";

export abstract class TapNode {

    abstract isLeaf(): boolean;
    abstract getScript(create?: boolean): Buffer;
    abstract getLeft(): TapNode;
    abstract getRight(): TapNode;

    getHash(): Buffer {
        if (this.isLeaf()) {
            const script = this.getScript();
            return getHash(script);
        } else {
            const left_h = this.getLeft()!.getHash();
            const right_h = this.getRight()!.getHash();
            return combineHashes(left_h, right_h);
        }
    }
}

export function taprootTweakPubkey(pubkey: Buffer, h: Buffer): any[] {
    const t = bigintFromBytes(taggedHash('TapTweak', Buffer.concat([pubkey, h])));
    if (t >= SECP256K1_ORDER) throw new Error('t >= SECP256K1_ORDER');
    const P = lift_x(bigintFromBytes(pubkey));
    const Q = pointAdd(P, pointMul(G, t));
    return [hasEvenY(Q) ? 0n : 1n, bytesFromBigint(Q?.x ?? 0n) ?? null];
}

function taprootTweakSecretKey(_seckey0: Buffer, h: Buffer) {
    const seckey0 = bigintFromBytes(_seckey0);
    const P = pointMul(G, seckey0);
    const seckey = hasEvenY(P) ? seckey0 : SECP256K1_ORDER - seckey0;
    const t = bigintFromBytes(taggedHash('TapTweak', Buffer.concat([bytesFromBigint(P?.x ?? 0n), h])));
    if (t >= SECP256K1_ORDER) throw new Error('t >= SECP256K1_ORDER');
    return bytesFromBigint((seckey + t) % SECP256K1_ORDER);
}

// Given an internal public key and a tree of scripts, compute the output script.
export function taprootOutputScript(internalPubkey: Buffer, scriptTree: TapNode): Buffer {
    const h = scriptTree.getHash();
    const [_, output_pubkey] = taprootTweakPubkey(internalPubkey, h);
    return Buffer.concat([Buffer.from([0x51, 0x20]), output_pubkey]);
}

export function getProof(node: TapNode, path: number[]): Buffer {
    if (node.isLeaf()) return Buffer.alloc(0);
    const t = path[0];
    let buf, sibling;
    if (t == 0) {
        buf = getProof(node.getLeft(), path.slice(1));
        sibling = node.getRight().getHash();
    } else {
        buf = getProof(node.getRight(), path.slice(1));
        sibling = node.getLeft().getHash();
    }
    return Buffer.concat([buf, sibling]);
}

export function taprootControlBlock(internalPubkey: Buffer, rootNode: TapNode, path: number[]): Buffer {
    const h = rootNode.getHash();
    const [parity, _] = taprootTweakPubkey(internalPubkey, h);

    const P = lift_x(bigintFromBytes(internalPubkey));

    const versionBuf = Buffer.from([taprootVersion | Number(parity)]);
    const keyBuf = Buffer.from(P.x.toString(16), "hex");
    const proof = getProof(rootNode, path);

    return Buffer.concat([versionBuf, keyBuf, proof]);
}

export function simpleTaproot(internalPubkey: Buffer, script: Buffer): {
    root: Buffer,
    controlBlock: Buffer,
    scriptHash: Buffer,
    internalPubkey: Buffer,
    outputPubKey: Buffer,
} {
    const hash = taggedHash(
        "TapLeaf",
        Buffer.concat([Buffer.from([taprootVersion]), compactSize(script.length), script]),
    );
    const [parity, output_pubkey] = taprootTweakPubkey(internalPubkey, hash);
    const root = Buffer.concat([Buffer.from([0x51, 0x20]), output_pubkey]);

    const P = lift_x(bigintFromBytes(internalPubkey));

    const versionBuf = Buffer.from([taprootVersion | Number(parity)]);
    const keyBuf = Buffer.from(padHex(P.x.toString(16), 32), "hex");

    const controlBlock = Buffer.concat([versionBuf, keyBuf]);

    return {
        root,
        controlBlock,
        scriptHash: hash,
        internalPubkey,
        outputPubKey: output_pubkey,
    };
}
