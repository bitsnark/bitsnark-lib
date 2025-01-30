import { bigintToBufferBE } from '../common/encoding';
import { getSpendingConditionByInput } from '../common/templates';
import { Input, Template, WitnessAndValue } from '../common/types';
import { decodeWinternitz, WOTS_NIBBLES } from '../common/winternitz';

function hashesFromBuffer(data: Buffer): Buffer[] {
    const result: Buffer[] = [];
    for (let i = 0; i < data.length; i += 20) {
        result.push(data.subarray(i, i + 20));
    }
    return result;
}

export function parseInput(templates: Template[], input: Input, data: Buffer[]): WitnessAndValue[] {
    const sc = getSpendingConditionByInput(templates, input);
    if (!sc) throw new Error('Spending condition not found');
    if (!sc.wotsSpec) return [];
    if (!sc.wotsPublicKeys) throw new Error('Missing public keys');

    const hashes = data.map((item) => hashesFromBuffer(item)).flat();
    let hashesIndex = 0;
    let resultIndex = 0;
    const result: WitnessAndValue[] = [];
    for (let i = 0; i < sc.wotsSpec.length; i++) {
        const spec = sc.wotsSpec[i];
        const keys = sc.wotsPublicKeys[i];
        const nibbleCount = WOTS_NIBBLES[spec];
        if (keys.length != nibbleCount) throw new Error('Wrong number of keys');
        try {
            const th = hashes.slice(hashesIndex, hashesIndex + nibbleCount);
            const tv = decodeWinternitz(spec, th, keys);
            result[resultIndex++] = {
                value: tv,
                buffer: bigintToBufferBE(tv, 256),
                witness: th
            };
        } catch (e) {
            console.error('Error decoding input:', input);
            throw e;
        }
        hashesIndex += nibbleCount;
    }
    return result;
}

export function parseInputs(templates: Template[], inputs: Input[], witnesses: Buffer[][]): WitnessAndValue[][] {
    return inputs.map((input, i) => parseInput(templates, input, witnesses[i]));
}
