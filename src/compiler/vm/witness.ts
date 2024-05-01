
interface Item {
    line: number;
    value: bigint;
}

export class Witness {

    items: Item[] = [];
    map: Map<number, Item> = new Map<number, Item>();

    constructor() {
    }

    set(line: number, value: bigint) {
        //if( value === 0n) throw new Error('fubar');
        const item = { line, value };
        this.items.push(item);
        this.map.set(line, item);
    }

    get(line: number): Item {
        return this.map.get(line) ?? { line, value: 0n };
    }

    getJson(): any {
        return {
            items: this.items.map(item => ({ line: item.line, value: item.value.toString(16) }))
        };
    }
}
