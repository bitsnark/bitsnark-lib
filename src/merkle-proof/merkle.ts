import { hash } from "./sha-256";
import { prepareWitness } from "./utils";
import { Register } from "./vm/state";
import { vm } from "./vm/vm";

export function verifyMerkleProof(hashes: bigint[], root: bigint): boolean {

    const r_hashes: Register[][] = hashes.map(n => prepareWitness(n));
    const expected: Register[] = prepareWitness(root);
    const temp: Register[] = r_hashes.shift()!;

    for (let i = 0; i < r_hashes.length; i++) {
        hash(temp, [ ...temp, ...r_hashes[i] ]);
    }

    for (let i = 0; i < temp.length; i++) {
        vm.assertEqual(temp[i], expected[i]);
    }

    return vm.success;
}

const hashes = [
    0x3487578354897345987abbf713298017347dddcca8760987aabbbccdd9879879n,
    0x8abbfc987987987abb00ccd98798798ffffffbbbc908797987cccdddddaaaaaan,
    0x3487578354897345987abbf713298017347dddcca8760987aabbbccdd9879879n,
    0x8abbfc987987987abb00ccd98798798ffffffbbbc908797987cccdddddaaaaaan,
    0x3487578354897345987abbf713298017347dddcca8760987aabbbccdd9879879n,
    0x8abbfc987987987abb00ccd98798798ffffffbbbc908797987cccdddddaaaaaan,
    0x3487578354897345987abbf713298017347dddcca8760987aabbbccdd9879879n,
    0x8abbfc987987987abb00ccd98798798ffffffbbbc908797987cccdddddaaaaaan ];

const testHash = 0x54c3f3d905082f7f3b20538aa7219eb64af6be46b7cbbaa90a779748606b9a5cn;

verifyMerkleProof(hashes, testHash);

console.log(`Success: ${vm.success}   \t   Instructions: ${vm.instructions.length}   \t   Witness: ${vm.witness.length}   \t   Registers: ${vm.state.maxRegCount}`)
