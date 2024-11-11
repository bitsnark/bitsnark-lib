
let lastId = 0;

export interface StackItem {
    id: number;
    value: number | Buffer;
    name?: string;
    data?: bigint;
}

export class Stack {
    items: StackItem[] = [];
    maxLength = 0;

    newItem(value: number | Buffer): StackItem {
        const si = { value: value, id: lastId++ };
        this.items.push(si);
        return si;
    }

    findIndex(si: StackItem): number {
        return this.items.findIndex(t => t.id === si.id);
    }

    push(si: StackItem) {
        if (!si) throw new Error('Undefined in stack');
        this.items.push(si);
        //console.log('Stack length: ', this.items.length);
        this.maxLength = Math.max(this.maxLength, this.items.length);
    }

    pop(): StackItem {
        const si = this.items.pop();
        if (!si) throw new Error('Stack underflow');
        //console.log('Stack length: ', this.items.length);
        return si;
    }

    roll(i: number) {
        const t = this.items[i];
        this.drop(i);
        this.push(t);
        //console.log('Stack length: ', this.items.length);
    }

    drop(i: number) {
        this.items.splice(i, 1);
        //console.log('Stack length: ', this.items.length);
    }

    pick(i: number) {
        const t = this.items[i];
        this.push({ value: t.value, id: lastId++, name: `${t.name} picked` });
        //console.log('Stack length: ', this.items.length);
    }

    top() {
        return this.items[this.items.length - 1];
    }

    length() {
        return this.items.length;
    }
}
