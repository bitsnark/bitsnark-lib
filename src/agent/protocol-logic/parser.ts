import { bigintToBufferBE } from '../common/encoding';
import { getSpendingConditionByInput } from '../common/templates';
import { Input, Template, WitnessAndValue } from '../common/types';
import { decodeWinternitz, WOTS_NIBBLES, WOTS_OUTPUT } from '../common/winternitz';

export function parseInput(templates: Template[], input: Input, data: Buffer[]): WitnessAndValue[] {
    const sc = getSpendingConditionByInput(templates, input);
    if (!sc) throw new Error('Spending condition not found');
    if (!sc.wotsSpec) return [];
    if (!sc.wotsPublicKeys) throw new Error('Missing public keys');
    const hashes = data;
    let hashesIndex = 0;
    let resultIndex = 0;
    const result: WitnessAndValue[] = [];
    for (let i = 0; i < sc.wotsSpec.length; i++) {
        const spec = sc.wotsSpec[i];
        const keys = sc.wotsPublicKeys[i];
        if (keys.length != WOTS_NIBBLES[spec]) throw new Error('Wrong number of keys');
        try {
            const th = hashes.slice(hashesIndex, hashesIndex + WOTS_OUTPUT[spec]);
            const tv = decodeWinternitz(spec, th, keys);
            result[resultIndex++] = {
                value: tv,
                buffer: bigintToBufferBE(tv, 256),
                witness: th,
                publicKeys: keys 
            };
        } catch (e) {
            console.error('Error decoding input:', input);
            throw e;
        }
        hashesIndex += WOTS_OUTPUT[spec];
    }
    return result;
}

export function parseInputs(templates: Template[], inputs: Input[], witnesses: Buffer[][]): WitnessAndValue[][] {
    return inputs.map((input, i) => parseInput(templates, input, witnesses[i]));
}
