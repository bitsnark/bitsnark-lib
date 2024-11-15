function makeTree() {
    const ar: string[] = [];
    for (let i = 0; i < 64; i++) {
        ar.push('' + i);
    }
    let tar = ar;
    const tree: string[][] = [ar];
    while (tar.length > 1) {
        const ttt: string[] = [];
        for (let i = 0; i < tar.length; ) {
            ttt.push(`(${tar[i++]}|${tar[i++]})`);
        }
        tree.push(ttt);
        tar = ttt;
    }
    return tree;
}

function makeProof(tree: string[][], index: number) {
    const proof: string[] = [];
    for (let line = 0; line < tree.length; line++) {
        proof.push(tree[line][index]);
        if ((index & 1) == 0) proof.push(tree[line][index + 1]);
        else proof.push(tree[line][index - 1]);
        index = Math.floor(index / 2);
    }
    return proof;
}

const tree = makeTree();
const proof = makeProof(tree, 7);
console.log(proof);
