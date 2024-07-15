import { step2_vm } from "./vm/vm";
import { Register } from "../common/register";
import { SHA256 } from "./sha-256"
import { _256 } from "./vm/types"

export function verifyMerkleProof(proof: _256[], index: number) {
    const sha256 = new SHA256();
    for (let i = 1; i < proof.length - 1; i++) {
        if ((index & 1) == 0) {
            sha256.sha256pair(proof[0], proof[0], proof[i]);
        } else {
            sha256.sha256pair(proof[0], proof[i], proof[0]);
        }
        index = index >> 1;
    }
    sha256.free();
    for (let i = 0; i < 8; i++) {
        step2_vm.assertEq(proof[0][i], proof[proof.length-1][i]);
        if (proof[0][i] != proof[proof.length-1][i]) break;
    }
}
