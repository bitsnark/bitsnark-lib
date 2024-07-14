import { combineHashes, getHash } from "./taproot";

export class Compressor {

    data: Buffer[][] = [];
    counter: number = 0;

    constructor(private depth: number) {
        this.data = new Array(depth).fill([]);
    }

    addItem(script: Buffer) {
        this.compress();
        this.data[this.data.length - 1].push(getHash(script));
        this.counter++;

        console.log('*** ', this.data);
    }

    compress() {
        for (let i = this.data.length - 1; i > 0; i--) {
            if (this.data[i].length == 2) {
                const hash = combineHashes(this.data[i][0], this.data[i][1]);
                this.data[i] = [];
                this.data[i-1].push(hash);
            }
        }
    }

    getRoot(): Buffer {
        while (this.counter < 2 ** this.depth) this.addItem(Buffer.alloc(0));
        this.compress();
        return this.data[0][0];
    }
}
