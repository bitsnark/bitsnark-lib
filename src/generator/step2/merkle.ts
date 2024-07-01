import { step2_vm } from "./vm/vm";
import { Register } from "../common/register";
import { sha256pair } from "./sha-256"

export class Merkle {
    private tree: Register[][][]

    public constructor(transactions: Register[][]) {
        this.tree = [transactions]
        if ((transactions.length & 1) != 0) {
            this.tree[0].push(step2_vm.newTemp256(true))
        }
        let llen = this.tree[0].length
        for (let i = 0; llen > 1; i++) {
            llen = this.MakeLayer(this.tree[i])
        }
    }

    public GetRoot() : Register[] {
        return this.tree[this.tree.length - 1][0]
    }

    public GetProof(index : number) : Register[][] {
        let proof: Register[][] = []
        for (let i = 0; i < this.tree.length - 1; i++) {
            proof.push(this.tree[i][index^1])
            index = index >> 1
        }
        return proof
    }

    public Free() {
        for (let i = 0; i < this.tree.length; i++) {
            let layer = this.tree[i]
            for (let j = 0; j < layer.length; j++) {
                let node = layer[j]
                for (let k = 0; k < node.length; k++) {
                    step2_vm.freeRegister(node[k])
                }
            }
        }
    }

    private MakeLayer(inputs: Register[][]) : number {
        let ilen = inputs.length
        let llen = ilen >> 1
        let layer: Register[][] = []
        for (let i = 0, j = 0; j < llen; j++) {
            let hash = step2_vm.newTemp256(true)
            sha256pair(hash, inputs[i], inputs[i + 1])
            layer.push(hash)
            i += 2
        }
        if (llen > 1 && (llen & 1) != 0) {
            layer.push(step2_vm.newTemp256(true))
        }
        this.tree.push(layer)
        return layer.length
    }
}

export function MerkleProve(index: number, transaction: Register[], proof: Register[][], root: Register[]) : boolean {
    let hash: Register[] = []
    let hashtmp: Register[] = []
    for (let i = 0; i < root.length; i++) {
        hash.push(step2_vm.newRegister())
        step2_vm.mov(hash[i], transaction[i])
        hashtmp.push(step2_vm.newRegister())
    }
    for (let i = 0; i < proof.length; i++) {
        if ((index & 1) == 0) {
            sha256pair(hashtmp, hash, proof[i])
        } else {
            sha256pair(hashtmp, proof[i], hash)
        }
        for (let j = 0; j < root.length; j++) {
            step2_vm.mov(hash[j], hashtmp[j])
        }
        index = index >> 1
    }
    let proved = true
    for (let i = 0; i < root.length; i++) {
        step2_vm.assertEq(hash[i], root[i])
        proved = proved && (hash[i].value == root[i].value)
    }
    for (let i = 0; i < root.length; i++) {
        step2_vm.freeRegister(hash[i])
        step2_vm.freeRegister(hashtmp[i])
    }
    return proved
}