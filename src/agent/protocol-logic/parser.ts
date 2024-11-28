import { findOutputByInput, Input, Transaction } from '../common/transactions';
import { decodeWinternitz, WOTS_NIBBLES } from '../common/winternitz';

function hashesFromBuffer(data: Buffer): Buffer[] {
    const result: Buffer[] = [];
    for (let i = 0; i < data.length; i += 20) {
        result.push(data.subarray(i, i + 20));
    }
    return result;
}

export interface ProofData {
    proof: bigint[];
}

export interface SelectData {
    selection: number;
}

export interface StateData {
    stateRoots: Buffer[];
}

type MerkleProofData = Buffer[];

export interface ArgumentData {
    index: number;
    a: bigint;
    b: bigint;
    c: bigint;
    d: bigint;
    merkleProofs: MerkleProofData;
}

export function parseInput(transactions: Transaction[], input: Input, data: Buffer[]): bigint[] {
    const output = findOutputByInput(transactions, input);
    if (!output) throw new Error('Output not found');
    const sc = output.spendingConditions[input.spendingConditionIndex];
    if (!sc) throw new Error('Spending condition not found');
    if (!sc.wotsSpec) return [];
    if (!sc.wotsPublicKeys) throw new Error('Missing public keys');

    const hashes = data.map((item) => hashesFromBuffer(item)).flat();
    let hashesIndex = 0;
    let resultIndex = 0;
    const result: bigint[] = [];
    for (let i = 0; i < sc.wotsSpec.length; i++) {
        console.log('FOOOOOO ', i);

        const spec = sc.wotsSpec[i];
        const keys = sc.wotsPublicKeys[i];
        const nibbleCount = WOTS_NIBBLES[spec];
        if (keys.length != nibbleCount) throw new Error('Wrong number of keys');
        result[resultIndex++] = decodeWinternitz(spec, hashes.slice(hashesIndex, hashesIndex + nibbleCount), keys);
        hashesIndex += nibbleCount;
    }
    return result;
}
