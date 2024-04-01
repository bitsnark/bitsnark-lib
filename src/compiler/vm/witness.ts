
interface Item {
    line: number;
    value: bigint;
    title: string;
}

export class Witness {

    items: Item[] = [];
    map: Map<number, Item> = new Map<number, Item>();

    constructor() {
    }

    set(line: number, value: bigint, title: string) {
        const item = { line, value, title };
        this.items.push(item);
        this.map.set(line, item);
    }

    get(line: number): Item {
        return this.map.get(line) ?? { line, value: 0n, title: '' };
    }

    print() {
        console.log('*** WITNESS ***');
        for(const i of this.items) {
            console.log(`${i.line}: ${i.value} // ${i.title}`);
        }
        console.log(`Count: ${this.items.length}`);
    }
}
