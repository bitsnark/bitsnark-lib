import { createHash } from "node:crypto";
import { agentConf } from "../../agent.conf";

export enum WotsType {
    _256 = 'WOTS_256',
    _1 = 'WOTS_1'
}

export const WOTS_NIBBLES: any = {
    [WotsType._256]: 90,
    [WotsType._1]: 2
};

function hash(input: Buffer, times: number = 1): Buffer {
    let t = input;
    for (let i = 0; i < times; i++) {
        t = createHash('ripemd160').update(t).digest();
    }
    return t;
}

function getWinternitzPrivateKey(unique: string): Buffer {
    return createHash('sha256')
        .update(agentConf.winternitzSecret, 'ascii')
        .update(unique)
        .digest();
}

function getWinternitzPublicKey(unique: string, bitsPerNibble: number): Buffer {
    return hash(getWinternitzPrivateKey(unique), 2 ** bitsPerNibble);
}

export function getWinternitzPrivateKeys(wotsType: WotsType, unique: string): Buffer[] {
    const t: Buffer[] = [];
    for (let i = 0; i < WOTS_NIBBLES[wotsType]; i++) {
        t.push(getWinternitzPrivateKey(unique + i));
    }
    return t;
}

export function getWinternitzPublicKeys(wotsType: WotsType, unique: string): Buffer[] {
    const t: Buffer[] = [];
    for (let i = 0; i < WOTS_NIBBLES[wotsType]; i++) {
        t.push(getWinternitzPublicKey(unique + i, 3));
    }
    return t;
}
