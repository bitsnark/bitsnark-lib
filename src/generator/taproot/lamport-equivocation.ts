import { ProtocolStep } from "../../../tests/demo/common";
import { getLamportPublicKey } from "../../encoding/lamport";
import { Bitcoin } from "../step3/bitcoin";
import { TapNode, taprootOutputScript } from "./taproot";

const steps = [ProtocolStep.STEP1, ProtocolStep.TRANSITION, ProtocolStep.STEP2];
const iterationsPerStep = 32;

class LamportEquivocastionTaprootNode extends TapNode {

    constructor(path?: number[]) {
        super(path ?? []);
    }

    fromPath(path: number[]): TapNode {
        return new LamportEquivocastionTaprootNode(path);
    }

    isLeaf(): boolean {
        return this.path.length == steps.length * iterationsPerStep;
    }

    getScript(): Buffer {
        const index = parseInt(this.path.map(n => `${n}`).join(), 2);
        const k0 = getLamportPublicKey(index, 0);
        const k1 = getLamportPublicKey(index, 1);
        const bitcoin = new Bitcoin();
        const w0 = bitcoin.addWitness(0n);
        const w1 = bitcoin.addWitness(0n);
        bitcoin.lamportEquivocation([ w0, w1 ], [ k0, k1 ]);
        return bitcoin.programToBinary();
    }
}

export function makeLamportEquivocationTaproot(internalPublicKey: Buffer) {
    return taprootOutputScript(internalPublicKey, new LamportEquivocastionTaprootNode());
}
