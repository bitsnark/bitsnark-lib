import { Bitcoin } from '../../generator/btc_vm/bitcoin';
import { StackItem } from '../../generator/btc_vm/stack';
import { prime_bigint } from '../common/constants';
import { BtcArithmetic } from './btc-arithmetic';
import { bigintToNibbles_3 } from './nibbles';

export class NegifyFinalStep {
    constructor(private bitcoin: Bitcoin) {}

    private negifyFromStack() {
        this.bitcoin.OP_NOT();
        this.bitcoin.OP_VERIFY();
    }

    private makeBoolOnStack(a: StackItem[]) {
        this.bitcoin.OP_0_16(0);
        for (let i = 0; i < a.length; i++) {
            this.bitcoin.pick(a[i]);
            this.bitcoin.OP_ADD();
        }
        this.bitcoin.OP_NOT();
        this.bitcoin.OP_NOT();
    }

    // fail if numerically equal to 0
    public negifyNumZero(a: StackItem[]) {
        this.bitcoin.OP_0_16(0);
        for (let i = 0; i < a.length; i++) {
            this.bitcoin.pick(a[i]);
            this.bitcoin.OP_ADD();
        }
        this.bitcoin.OP_VERIFY();
    }

    // fail if numerically equal to 1
    public negifyNumOne(a: StackItem[]) {
        this.bitcoin.pick(a[0]);
        this.bitcoin.OP_0_16(1);
        this.bitcoin.OP_NUMEQUAL();
        for (let i = 1; i < a.length; i++) {
            this.bitcoin.OP_0_16(1);
            this.bitcoin.OP_NUMEQUAL();
            this.bitcoin.OP_BOOLAND();
        }
        this.negifyFromStack();
    }

    // fail if c = !a (boolean)
    public negifyNot(a: StackItem[], b: StackItem[]) {
        this.makeBoolOnStack(a);
        this.makeBoolOnStack(b);
        this.bitcoin.OP_NUMEQUALVERIFY();
    }

    // fail if c = a || b with a, b and c treated as boolean
    public negifyOr(a: StackItem[], b: StackItem[], c: StackItem[]) {
        this.makeBoolOnStack(a);
        this.makeBoolOnStack(b);
        this.bitcoin.OP_BOOLOR();
        this.makeBoolOnStack(c);
        this.bitcoin.OP_NOT();
        this.bitcoin.OP_NUMEQUALVERIFY();
    }

    // fail if c = a && b with a, b and c treated as boolean
    public negifyAnd(a: StackItem[], b: StackItem[], c: StackItem[]) {
        this.makeBoolOnStack(a);
        this.makeBoolOnStack(b);
        this.bitcoin.OP_BOOLAND();
        this.makeBoolOnStack(c);
        this.bitcoin.OP_NOT();
        this.bitcoin.OP_NUMEQUALVERIFY();
    }

    // fail if numerically a == c
    public negifyMov(a: StackItem[], c: StackItem[]) {
        const temp = this.bitcoin.newStackItem(0);
        this.bitcoin.equalMany(temp, a, c);
        this.negifyFromStack();
    }

    // fail if a numerically c = a == b
    public negifyEqual(a: StackItem[], b: StackItem[], c: StackItem[]) {
        const temp = this.bitcoin.newStackItem(0);
        this.bitcoin.equalMany(temp, a, b);
        this.bitcoin.pick(temp);
        this.makeBoolOnStack(c);
        this.bitcoin.OP_NUMEQUAL();
        this.negifyFromStack();
    }

    public negifyAddMod(a: StackItem[], b: StackItem[], c: StackItem[]) {
        const btca = new BtcArithmetic(this.bitcoin);
        const w_p = btca.addWitness(bigintToNibbles_3(prime_bigint, 86));
        btca.initializeAddTables();
        const t = btca.add(a, b);
        const temp = this.bitcoin.newStackItem(0);
        this.bitcoin.equalMany(temp, t, c);
        this.bitcoin.pick(temp);
        this.negifyFromStack();
        btca.subtractFromA(t, w_p);
        this.bitcoin.equalMany(temp, t, c);
        this.bitcoin.pick(temp);
        this.negifyFromStack();
        this.bitcoin.drop(temp);
    }

    public negifySubMod(a: StackItem[], b: StackItem[], c: StackItem[]) {
        // a - b = c => a = c + b
        this.negifyAddMod(b, c, a);
    }

    public negifyMulMod(a: StackItem[], b: StackItem[], c: StackItem[], d: StackItem[]) {
        const btca = new BtcArithmetic(this.bitcoin);
        const w_p = btca.addWitness(bigintToNibbles_3(prime_bigint, 86));
        btca.initializeAddTables();
        btca.initializeMulTables();
        const m = btca.karatsubaMult(a, b, 1);
        btca.drop(a);
        btca.drop(b);
        let t = btca.karatsubaMult(w_p, d, 1);
        btca.drop(w_p);
        btca.drop(d);
        t = btca.add(t, c);
        const temp = this.bitcoin.newStackItem(0);
        this.bitcoin.equalMany(temp, t, m);
        this.bitcoin.pick(temp);
        this.negifyFromStack();
    }

    public negifyDivMod(a: StackItem[], b: StackItem[], c: StackItem[], d: StackItem[]) {
        // a / b = c => a = b * c
        this.negifyMulMod(b, c, a, d);
    }

    private getBitFromA(bitcoin: Bitcoin, a: StackItem[], bit: number): StackItem {
        const table: StackItem[] = [];
        for (let i = 0; i < 8; i++) {
            table[i] = bitcoin.newStackItem(i & (2 ** (bit % 3)) ? 1 : 0);
        }

        const si = a[Math.floor(bit / 3)];
        const temp = bitcoin.newStackItem(0);
        bitcoin.tableFetch(temp, table[0], si);
        bitcoin.drop(table);
        return temp;
    }

    private _verifyAndBit(a: StackItem[], b: StackItem[], c: StackItem[], bit: number, notFlag: boolean) {
        const bitValue = this.getBitFromA(this.bitcoin, a, bit);

        const temp_b = this.bitcoin.newStackItem(0);
        this.bitcoin.equalMany(temp_b, c, b);

        const zero = this.bitcoin.newNibbles(b.length);
        const temp_0 = this.bitcoin.newStackItem(0);
        this.bitcoin.equalMany(temp_0, c, zero);
        this.bitcoin.drop(zero);

        // bitValue && temp_b || !bitValue && temp_0

        this.bitcoin.pick(bitValue);
        if (notFlag) this.bitcoin.OP_NOT();
        this.bitcoin.pick(temp_b);
        this.bitcoin.OP_BOOLAND();

        this.bitcoin.pick(bitValue);
        if (!notFlag) this.bitcoin.OP_NOT();
        this.bitcoin.pick(temp_0);
        this.bitcoin.OP_BOOLAND();

        this.bitcoin.OP_BOOLOR();
        this.bitcoin.OP_VERIFY();

        this.bitcoin.drop([bitValue, temp_0, temp_b]);
    }

    public negifyAndBit(a: StackItem[], b: StackItem[], c: StackItem[], bit: number) {
        this._verifyAndBit(a, b, c, bit, true);
    }

    public negifyAndNotBit(a: StackItem[], b: StackItem[], c: StackItem[], bit: number) {
        this._verifyAndBit(a, b, c, bit, false);
    }
}
