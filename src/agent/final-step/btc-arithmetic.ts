import { Bitcoin } from '../../generator/btc_vm/bitcoin';
import { StackItem } from '../../generator/btc_vm/stack';
import { last } from '../common/common';
import { teaPot } from '../common/common';
import { nibblesToBigintLS } from './nibbles';

export class BtcArithmetic {
    bitcoin: Bitcoin;
    table: StackItem[] = [];
    tableRow: StackItem[] = [];
    breakTableValue: StackItem[] = [];
    breakTableCarry: StackItem[] = [];

    constructor(_bitcoin?: Bitcoin) {
        this.bitcoin = _bitcoin ?? new Bitcoin();
    }

    public initializeAddTables() {
        for (let i = 0; i < 64; i++) {
            this.breakTableValue[i] = this.bitcoin.hardcode(i & 7);
        }
        for (let i = 0; i < 64; i++) {
            this.breakTableCarry[i] = this.bitcoin.hardcode(i >> 3);
        }
    }
    public initializeMulTables() {
        for (let i = 0; i < 8; i++) {
            this.tableRow[i] = this.bitcoin.hardcode(i * 8);
        }
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) this.table[i * 8 + j] = this.bitcoin.hardcode(i * j);
        }
    }

    public addWitness(na: number[]) {
        const result: StackItem[] = [];
        for (let i = 0; i < na.length; i++) {
            result.push(this.bitcoin.newStackItem(na[i]));
        }
        return result;
    }

    public drop(si: StackItem | StackItem[]) {
        this.bitcoin.drop(si);
    }

    private nibbleMult(a: StackItem, b: StackItem) {
        this.bitcoin.pick(a);
        this.bitcoin.tableFetchInStack(this.tableRow);
        this.bitcoin.pick(b);
        this.bitcoin.OP_ADD();
        this.bitcoin.tableFetchInStack(this.table);
    }

    public verifyEqual(a: StackItem[], b: StackItem[]) {
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            if (a[i]) this.bitcoin.pick(a[i]);
            else this.bitcoin.OP_0_16(0);
            if (b[i]) this.bitcoin.pick(b[i]);
            else this.bitcoin.OP_0_16(0);
            this.bitcoin.OP_NUMEQUALVERIFY();
        }
    }

    public equal(a: StackItem[], b: StackItem[]): StackItem {
        const t = this.bitcoin.newStackItem(0);
        this.bitcoin.equalNibbles(t, a, b);
        return t;
    }

    public add(a: StackItem[], b: StackItem[]): StackItem[] {
        const result = this.bitcoin.newNibblesFast(Math.max(a.length, b.length) + 1);

        const stack = this.bitcoin.stack.items;

        const l = Math.max(a.length, b.length);
        for (let i = 0; i < l; i++) {
            if (i == 0) {
                this.bitcoin.OP_0_16(0); // 0
            } else {
                this.bitcoin.OP_FROMALTSTACK();
            }

            this.bitcoin.pick(a[i]); // carry a[i]
            this.bitcoin.OP_ADD(); // carry+a[i]
            if (b[i]) {
                this.bitcoin.pick(b[i]); // carry+a[i] b[i]
                this.bitcoin.OP_ADD(); // carry+a[i]+b[i]
            }

            this.bitcoin.OP_DUP(); // carry+a[i]+b[i] carry+a[i]+b[i]
            this.bitcoin.tableFetchInStack(this.breakTableCarry); // new_carry
            this.bitcoin.OP_TOALTSTACK();

            this.bitcoin.tableFetchInStack(this.breakTableValue); // carry+a[i]+b[i] value
            this.bitcoin.replaceWithTop(result[i]); // carry+a[i]+b[i]
        }
        this.bitcoin.OP_FROMALTSTACK();
        this.bitcoin.replaceWithTop(result[l]); //

        if (nibblesToBigintLS(a) + nibblesToBigintLS(b) != nibblesToBigintLS(result)) teaPot();

        return result;
    }

    public subtractFromA(a: StackItem[], b: StackItem[]) {
        if (a.length < b.length) teaPot();

        const savedA = nibblesToBigintLS(a);
        const savedB = nibblesToBigintLS(b);

        const stack = this.bitcoin.stack.items;

        for (let i = 0; i < a.length; i++) {
            this.bitcoin.pick(a[i]); // a[i]

            if (i == 0) {
                this.bitcoin.OP_0_16(0); // 0
            } else {
                this.bitcoin.OP_FROMALTSTACK();
            }

            if (b[i]) {
                this.bitcoin.pick(b[i]); // a[i] borrow b[i]
                this.bitcoin.OP_ADD(); // a[i] borrow+b[i]
            }
            this.bitcoin.OP_SUB(); // a[i]-borrow-b[i]
            this.bitcoin.OP_DUP(); // a[i]-borrow-b[i] a[i]-borrow-b[i]
            this.bitcoin.OP_0_16(0); // a[i]-borrow-b[i] a[i]-borrow-b[i] 0
            this.bitcoin.OP_LESSTHAN(); // a[i]-borrow-b[i] flag

            const flag = last(stack).value;

            this.bitcoin.OP_IF(); // a[i]-borrow-b[i]
            this.bitcoin.OP_0_16(8); // a[i]-borrow-b[i] 8
            this.bitcoin.OP_ADD(); // a[i]-borrow-b[i]+8
            this.bitcoin.OP_0_16(1); // a[i]-borrow-b[i]+8 1
            this.bitcoin.OP_ELSE(); // a[i]-borrow-b[i]
            this.bitcoin.OP_0_16(0); // a[i]-borrow-b[i] 0
            this.bitcoin.OP_ENDIF();

            // hack
            stack.pop();
            last(stack).value = flag;
            if (!flag) (stack[stack.length - 2].value as number) -= 8;

            if (i + 1 < a.length) this.bitcoin.OP_TOALTSTACK(); // a[i]-borrow-b[i]
            this.bitcoin.replaceWithTop(a[i]); //
        }

        if (savedA - savedB != nibblesToBigintLS(a)) teaPot();
    }

    public naiiveMult(a: StackItem[], b: StackItem[]): StackItem[] {
        if (a.length != b.length) teaPot();

        const result = this.bitcoin.newNibblesFast(a.length + b.length);

        for (let i = 0; i < a.length; i++) {
            this.bitcoin.OP_0_16(0);
            this.bitcoin.OP_TOALTSTACK();

            for (let j = 0; j < b.length; j++) {
                this.nibbleMult(a[i], b[j]);
                this.bitcoin.OP_FROMALTSTACK();
                this.bitcoin.OP_ADD();
                this.bitcoin.pick(result[i + j]);
                this.bitcoin.OP_ADD();
                this.bitcoin.OP_DUP();
                this.bitcoin.tableFetchInStack(this.breakTableCarry);
                this.bitcoin.OP_TOALTSTACK();
                this.bitcoin.tableFetchInStack(this.breakTableValue);
                this.bitcoin.replaceWithTop(result[i + j]);
            }
            this.bitcoin.OP_FROMALTSTACK();
            this.bitcoin.replaceWithTop(result[i + b.length]);
        }

        if (nibblesToBigintLS(a) * nibblesToBigintLS(b) != nibblesToBigintLS(result)) teaPot();

        return result;
    }

    public karatsubaMult(a: StackItem[], b: StackItem[], maxDepth: number): StackItem[] {
        if (a.length != b.length) teaPot();

        if (maxDepth == 0) return this.naiiveMult(a, b);

        const origA = nibblesToBigintLS(a);
        const origB = nibblesToBigintLS(b);

        const l = Math.floor(a.length / 2);

        const t1a = a.slice(l);
        const t1b = b.slice(l);
        const t2a = a.slice(0, l);
        const t2b = b.slice(0, l);

        const m2 = maxDepth > 1 ? this.karatsubaMult(t1a, t1b, maxDepth - 1) : this.naiiveMult(t1a, t1b);
        const m0 = maxDepth > 1 ? this.karatsubaMult(t2a, t2b, maxDepth - 1) : this.naiiveMult(t2a, t2b);

        const t3a = this.add(t1a, t2a);
        const t3b = this.add(t1b, t2b);

        const m1 = maxDepth > 1 ? this.karatsubaMult(t3a, t3b, maxDepth - 1) : this.naiiveMult(t3a, t3b);

        this.bitcoin.drop(t3a);
        this.bitcoin.drop(t3b);

        this.subtractFromA(m1, m0);
        this.subtractFromA(m1, m2);

        const result: StackItem[] = [];

        for (let i = 0; i < m0.length; i++) {
            result[i] = m0[i];
        }

        for (let i = 0; i < m2.length; i++) {
            result[2 * l + i] = m2[i];
        }

        for (let i = 0; i < m1.length; i++) {
            this.bitcoin.add(result[l + i], result[l + i], m1[i]);
        }

        this.bitcoin.drop(m1);

        for (let i = l; i < result.length; i++) {
            this.bitcoin.pick(result[i]);

            if (i == l) {
                this.bitcoin.OP_0_16(0); // 0
            } else {
                this.bitcoin.OP_FROMALTSTACK();
            }

            this.bitcoin.OP_ADD();
            if (i + 1 < result.length) {
                this.bitcoin.OP_DUP();
                this.bitcoin.tableFetchInStack(this.breakTableCarry);
                this.bitcoin.OP_TOALTSTACK();
            }
            this.bitcoin.tableFetchInStack(this.breakTableValue);
            this.bitcoin.replaceWithTop(result[i]);
        }

        const c = nibblesToBigintLS(result);
        if (origA * origB != c) teaPot();

        return result;
    }
}
