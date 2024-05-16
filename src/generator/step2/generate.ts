import { createWitness } from "./create-witness";
import { verifyMerkleProof } from "./merkle";
import { vm } from "./vm/vm";
import fs from 'fs';

export function generate() {

    const hashes = [
        0x3487578354897345987abbf713298017347dddcca8760987aabbbccdd9879879n,
        0x8abbfc987987987abb00ccd98798798ffffffbbbc908797987cccdddddaaaaaan,
        0x3487578354897345987abbf713298017347dddcca8760987aabbbccdd9879879n,
        0x8abbfc987987987abb00ccd98798798ffffffbbbc908797987cccdddddaaaaaan,
        0x3487578354897345987abbf713298017347dddcca8760987aabbbccdd9879879n,
        0x8abbfc987987987abb00ccd98798798ffffffbbbc908797987cccdddddaaaaaan,
        0x3487578354897345987abbf713298017347dddcca8760987aabbbccdd9879879n,
        0x8abbfc987987987abb00ccd98798798ffffffbbbc908797987cccdddddaaaaaan];

    const root = 0x54c3f3d905082f7f3b20538aa7219eb64af6be46b7cbbaa90a779748606b9a5cn;

    const witness = createWitness(hashes, root);

    verifyMerkleProof(
        witness.hashes.map(na => vm.initWitness(na)),
        vm.initWitness(witness.root));

    const path = './generated/merkle.json';
    const obj = vm.save();
    fs.writeFile(path, JSON.stringify(obj, undefined, 4), (err) => {
        if (err) console.log('Error writing file:', err);
        else console.log(`Successfully wrote file: ${path}`);
    });
}
