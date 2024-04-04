export interface StackItem {
}

export class Stack {
    items: StackItem[] = [];

    newItem() {
        const si = {};
        this.items.push(si);
        return si;
    }

    findIndex(si: StackItem): number | undefined {
        for (let i = 0; i < this.items.length; i++) {
            if (this.items[i] == si) return i;
        }
        return undefined;
    }

    push(si: StackItem) {
        this.items.push(si);
    }

    pop(): StackItem {
        const si = this.items.pop();
        if (!si) throw new Error('Stack underflow');
        return si;
    }

    roll(si: StackItem) {
        this.drop(si);
        this.push(si);
    }

    drop(si: StackItem) {
        const index = this.findIndex(si);
        if (typeof index == 'number') this.items.splice(index, 1);
    }

    pick(si: StackItem) {
        this.push(si);
    }

    top() {
        return this.items[this.items.length - 1];
    }

    length() {
        return this.items.length;
    }
}
