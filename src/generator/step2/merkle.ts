import { Register } from "../common/register";
import { hash } from "./sha-256";
import { vm } from "./vm/vm";

export function verifyMerkleProof(hashes: Register[][], root: Register[]): boolean {

    const temp: Register[] = hashes.shift()!;

    for (let i = 0; i < hashes.length; i++) {
        hash(temp, [ ...temp, ...hashes[i] ]);
    }

    for (let i = 0; i < temp.length; i++) {
        vm.assertEqual(temp[i], root[i]);
    }

    return vm.success;
}
