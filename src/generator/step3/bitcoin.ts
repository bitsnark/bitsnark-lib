import { hardcode, OpcodeType } from "./bitcoin-opcodes";
import { StackItem, Stack } from "./stack";

interface Operation {
    op?: OpcodeType;
    data?: number;
}

interface SimulatedRegister {
    index: number;
    stackItems: StackItem[];
    hardcoded: boolean;
}

export class Bitcoin {

    opcodes: Operation[] = [];
    simulatedRegisters: Map<number, SimulatedRegister> = new Map<number, SimulatedRegister>();
    stack: Stack = new Stack();
    failed: boolean = false;
    altStack: number[] = [];
    witness: number[] = [];

    constructor() {
    }

    reset() {
        this.opcodes = [];
        this.stack = new Stack();
        this.simulatedRegisters = new Map<number, SimulatedRegister>();
        this.failed = false;
    }

    setFailed() {
        this.failed = true;
    }

    /// BASIC ///

    newStackItem(value?: number): StackItem {
        if (this.stack.items.length + this.altStack.length > 1000) throw new Error('Stack too big');

        value = value ?? 0;
        const si = this.stack.newItem(value);
        if (value <= 16)
            this.opcodes.push({ op: hardcode(value)});
        else 
            this.opcodes.push({ op: OpcodeType.OP_PUSHDATA4, data: value })
        return si;      
    }

    private getRelativeStackPosition(si: StackItem): number {
        const index = this.stack.findIndex(si);
        if (index < 0) 
            throw new Error('Invalid relative position');
        return this.stack.length() - index - 1;
    }

    

    /// NATIVE OPERATIONS ///

    DATA(data: number) {
        if (data > 0 && data <= 16) {
            this.opcodes.push({ op: hardcode(data) });
        } else {
            this.opcodes.push({ op: OpcodeType.DATA, data });
        }
        this.stack.newItem(data);
    }

    OP_ROLL() {
        this.opcodes.push({ op: OpcodeType.OP_ROLL });
        const si = this.stack.pop();
        this.stack.roll(this.stack.length() - 1 - si.value);
    }

    OP_PICK() {
        this.opcodes.push({ op: OpcodeType.OP_PICK });
        const si = this.stack.pop();
        this.stack.pick(this.stack.length() - 1 - si.value);
    }

    OP_DROP() {
        this.opcodes.push({ op: OpcodeType.OP_DROP });
        this.stack.pop();
    }

    OP_NIP() {
        this.opcodes.push({ op: OpcodeType.OP_NIP });
        const t1 = this.stack.pop();
        const t2 = this.stack.pop();
        this.stack.push(t1);
    }

    OP_IF() {
        const si = this.stack.pop();
        this.opcodes.push({ op: OpcodeType.OP_IF });
    }
        
    OP_ELSE() {
        this.opcodes.push({ op: OpcodeType.OP_ELSE });
    }

    OP_ENDIF() {
        this.opcodes.push({ op: OpcodeType.OP_ENDIF});
    }

    OP_IF_SMARTASS(tfn: () => void, ffn?: () => void) {
        this.opcodes.push({ op: OpcodeType.OP_IF });
        const si = this.stack.pop();
        const s_before = this.stack.saveState();
        let s_afterFalse = s_before;
        tfn();
        const s_afterTrue = this.stack.saveState();
        if (ffn) {
            this.opcodes.push({ op: OpcodeType.OP_ELSE });
            this.stack.fromSavedState(s_before);
            ffn();
            s_afterFalse = this.stack.saveState();
        }
        this.opcodes.push({ op: OpcodeType.OP_ENDIF });
        if(si.value == 1) {
            this.stack.fromSavedState(s_afterTrue);
        } else {
            this.stack.fromSavedState(s_afterFalse);
        }
    }
    
    OP_0_16(n: number){
        this.opcodes.push({ op: hardcode(n) });
        this.stack.newItem(n);
    }

    OP_NUMEQUAL() {
        this.opcodes.push({ op: OpcodeType.OP_NUMEQUAL });
        const si1 = this.stack.pop();
        const si2 = this.stack.pop();
        this.stack.newItem(si1.value === si2.value ? 1 : 0);
    }
    
    OP_NOT() {
        this.opcodes.push({ op: OpcodeType.OP_NOT });
        const si = this.stack.pop();
        this.stack.newItem(si.value === 0 ? 1 : 0);
    }
    
    OP_DUP() {
        this.opcodes.push({ op: OpcodeType.OP_DUP });
        const si = this.stack.pop();
        this.stack.push(si);
        this.stack.newItem(si.value);
    }

    OP_ADD() {
        this.opcodes.push({ op: OpcodeType.OP_ADD });
        const si1 = this.stack.pop();
        const si2 = this.stack.pop();
        this.stack.newItem(si1.value + si2.value);
    }

    OP_SUB() {
        this.opcodes.push({ op: OpcodeType.OP_ADD });
        const si2 = this.stack.pop();
        const si1 = this.stack.pop();
        this.stack.newItem(si1.value - si2.value);
    }

    OP_GREATERTHAN() {
        this.opcodes.push({ op: OpcodeType.OP_GREATERTHAN });
        const si2 = this.stack.pop();
        const si1 = this.stack.pop();
        this.stack.newItem(si1.value > si2.value ? 1 : 0);
    }
    
    OP_GREATERTHANOREQUAL() {
        this.opcodes.push({ op: OpcodeType.OP_GREATERTHANOREQUAL });
        const si2 = this.stack.pop();
        const si1 = this.stack.pop();
        this.stack.newItem(si1.value >= si2.value ? 1 : 0);
    }

    OP_LESSTHAN() {
        this.opcodes.push({ op: OpcodeType.OP_LESSTHAN });
        const si2 = this.stack.pop();
        const si1 = this.stack.pop();
        this.stack.newItem(si1.value < si2.value ? 1 : 0);
    }

    OP_LESSTHANOREQUAL() {
        this.opcodes.push({ op: OpcodeType.OP_LESSTHANOREQUAL });
        const si2 = this.stack.pop();
        const si1 = this.stack.pop();
        this.stack.newItem(si1.value <= si2.value ? 1 : 0);
    }

    OP_BOOLOR() {
        this.opcodes.push({ op: OpcodeType.OP_BOOLOR });
        const si1 = this.stack.pop();
        const si2 = this.stack.pop();
        this.stack.newItem(!!si1.value || !!si2.value ? 1 : 0);
    }

    OP_BOOLAND() {
        this.opcodes.push({ op: OpcodeType.OP_BOOLAND });
        const si1 = this.stack.pop();
        const si2 = this.stack.pop();
        this.stack.newItem(!!si1.value && !!si2.value ? 1 : 0);
    }

    OP_WITHIN() {
        this.opcodes.push({ op: OpcodeType.OP_WITHIN });
        const x = this.stack.pop().value;
        let min = this.stack.pop().value;
        let max = this.stack.pop().value;
        const t = min;
        min = min < max ? min : max;
        max = t < max ? max : t;
        this.stack.newItem(x >= min && x <= max ? 1 : 0);
    }

    OP_NUMEQUALVERIFY() {
        this.opcodes.push({ op: OpcodeType.OP_NUMEQUALVERIFY });
        const f = this.stack.pop().value;
        if (f != 1) this.setFailed();
    }

    OP_TOALTSTACK() {
        this.opcodes.push({ op: OpcodeType.OP_TOALTSTACK });
        const si = this.stack.pop();
        this.altStack.push(si.value);
    }

    OP_FROMALTSTACK() {
        this.opcodes.push({ op: OpcodeType.OP_FROMALTSTACK });
        this.stack.newItem(this.altStack.pop()!);
    }

    OP_SWAP() {
        this.opcodes.push({ op: OpcodeType.OP_SWAP });
        const t1 = this.stack.items.pop()!;
        const t2 = this.stack.items.pop()!;
        this.stack.items.push(t1);
        this.stack.items.push(t2);
    }

    OP_2DUP() {
        this.opcodes.push({ op: OpcodeType.OP_2DUP });
        this.stack.newItem(this.stack.top().value);
        this.stack.newItem(this.stack.top().value);    
    }

    OP_3DUP() {
        this.opcodes.push({ op: OpcodeType.OP_3DUP });
        this.stack.newItem(this.stack.top().value);
        this.stack.newItem(this.stack.top().value);
        this.stack.newItem(this.stack.top().value);
    }

    OP_TUCK() {
        this.opcodes.push({ op: OpcodeType.OP_TUCK });
        const t1 = this.stack.items.pop()!;
        const t2 = this.stack.items.pop()!;
        const t3 = this.stack.items.pop()!;
        this.stack.items.push(t1);
        this.stack.items.push(t3);
        this.stack.items.push(t2);
    }

    OP_2SWAP() {
        this.opcodes.push({ op: OpcodeType.OP_TUCK });
        const t1 = this.stack.items.pop()!;
        const t2 = this.stack.items.pop()!;
        const t3 = this.stack.items.pop()!;
        const t4 = this.stack.items.pop()!;
        this.stack.items.push(t2);
        this.stack.items.push(t1);
        this.stack.items.push(t4);
        this.stack.items.push(t3);
    }

    OP_ROT() {
        this.opcodes.push({ op: OpcodeType.OP_ROT });
        const t1 = this.stack.items.pop()!;
        const t2 = this.stack.items.pop()!;
        const t3 = this.stack.items.pop()!;
        this.stack.items.push(t2);
        this.stack.items.push(t1);
        this.stack.items.push(t3);
    }

    /// Complex operations ///
    
    roll(si: StackItem) {
        const rel = this.getRelativeStackPosition(si);
        if (rel == 0) return;
        this.newStackItem(rel);
        this.OP_ROLL();
    }

    pick(si: StackItem) {
        const rel = this.getRelativeStackPosition(si);
        if (rel == 0) {
            this.OP_DUP();            
        } else {
            this.newStackItem(rel);
            this.OP_PICK();
        }
    }

    drop(si: StackItem | StackItem[]) {
        if (Array.isArray(si)) {
            si = si.sort((a, b) => this.getRelativeStackPosition(a) - this.getRelativeStackPosition(b));
            si.forEach(tsi => this.drop(tsi));
        } else {
            const rel = this.getRelativeStackPosition(si);
            if (rel == 0) {
                this.OP_DROP();
            } else if (rel == 1) {
                this.OP_NIP();
            } else {
                this.roll(si);
                this.OP_DROP();
            }
        }
    }

    replaceWithTop(si: StackItem) {
        this.drop(si);
        const tsi = this.stack.pop();
        si.value = tsi.value;
        this.stack.push(si);
    }

    xor(target: StackItem, a: StackItem, b: StackItem) {
        this.pick(a);
        this.pick(b);
        this.OP_ADD();
        this.OP_0_16(1);
        this.OP_NUMEQUAL();
        this.replaceWithTop(target);
    }

    and(target: StackItem, a: StackItem, b: StackItem) {
        this.pick(a);
        this.pick(b);
        this.OP_BOOLAND();
        this.replaceWithTop(target);
    }

    or(target: StackItem, a: StackItem, b: StackItem) {
        this.pick(a);
        this.pick(b);
        this.OP_BOOLOR();
        this.replaceWithTop(target);
    }

    ifTrue(si: StackItem, tfn: () => void, ffn?: () => void) {
        this.pick(si);
        this.OP_IF_SMARTASS(tfn, ffn);
    }

    equal(si: StackItem, a: StackItem, n: number) {
        this.OP_0_16(n);
        this.pick(a);
        this.OP_NUMEQUAL();
        this.replaceWithTop(si);
    }

    equals(si: StackItem, si1: StackItem, si2: StackItem) {
        this.pick(si1);
        this.pick(si2);
        this.OP_NUMEQUAL();
        this.replaceWithTop(si);
    }

    setBit_1(target: StackItem) {
        this.OP_0_16(1);
        this.replaceWithTop(target);
    }

    setBit_0(target: StackItem) {
        this.OP_0_16(0);
        this.replaceWithTop(target);
    }

    mov(target: StackItem, source: StackItem) {
        this.pick(source);
        this.replaceWithTop(target);
    }

    assertTrue(si: StackItem) {
        this.pick(si);
        this.OP_NUMEQUALVERIFY()
    }



    // private addBit(target: StackItem, carry: StackItem, a: StackItem, b: StackItem) {
    //     const fns = {
    //         fff: () => { this.setBit_0(target); },
    //         fft: () => { this.setBit_1(target); },
    //         ftf: () => { this.setBit_1(target); },
    //         ftt: () => { this.setBit_1(carry); this.setBit_0(target); },
    //         tff: () => { this.setBit_0(carry); this.setBit_1(target); },
    //         tft: () => { this.setBit_0(target); },
    //         ttf: () => { this.setBit_0(target); },
    //         ttt: () => { this.setBit_1(target); }
    //     };
    //     this.ifTrue(a, () =>
    //         this.ifTrue(b,
    //             () => this.ifTrue(carry, fns.ttt, fns.ftt),
    //             () => this.ifTrue(carry, fns.tft, fns.ftf)),
    //         () =>
    //             this.ifTrue(b,
    //                 () => this.ifTrue(carry, fns.tft, fns.fft),
    //                 () => this.ifTrue(carry, fns.tft, fns.fff)));
    // }

    // private subBit(target: StackItem, borrow: StackItem, a: StackItem, b: StackItem) {
    //     const fns = {
    //         fff: () => { this.setBit_0(target); },
    //         fft: () => { this.setBit_1(borrow); this.setBit_1(target); },
    //         ftf: () => { this.setBit_1(target); },
    //         ftt: () => { this.setBit_0(target); },
    //         tff: () => { this.setBit_1(target); },
    //         tft: () => { this.setBit_0(target); },
    //         ttf: () => { this.setBit_0(borrow); this.setBit_0(target); },
    //         ttt: () => { this.setBit_0(target); }
    //     };
    //     this.ifTrue(a, () =>
    //         this.ifTrue(b,
    //             () => this.ifTrue(borrow, fns.ttt, fns.ftt),
    //             () => this.ifTrue(borrow, fns.tft, fns.ftf)),
    //         () =>
    //             this.ifTrue(b,
    //                 () => this.ifTrue(borrow, fns.tft, fns.fft),
    //                 () => this.ifTrue(borrow, fns.tft, fns.fff)));
    // }

    // /// Register operations ///

    // private clearRegister(target: SimulatedRegister) {
    //     for (let i = 0; i < 256; i++) {
    //         this.pushOpcode(OpcodeType.OP_0);
    //         this.replaceWithTop(target.stackItems[i]);
    //     }
    // }

    // private movRegister(target: SimulatedRegister, a: SimulatedRegister) {
    //     for (let i = 0; i < 256; i++) {
    //         this.pick(a.stackItems[i]);
    //         this.replaceWithTop(target.stackItems[i]);
    //     }
    // }

    // private gtRegister(target: StackItem, a: SimulatedRegister, b: SimulatedRegister) {
    //     const found = this.newStackItem();
    //     this.setBit_0(target);
    //     const closure = (ti: number) => {
    //         this.ifBit(found, undefined, () => {
    //             this.ifBit(a.stackItems[ti],
    //                 () => this.ifBit(b.stackItems[ti], undefined, () => {
    //                     this.setBit_1(found);
    //                     this.setBit_1(target);
    //                 }),
    //                 () => this.ifBit(b.stackItems[ti], () => {
    //                     this.setBit_1(found);
    //                     this.setBit_0(target);
    //                 }, undefined));
    //         });
    //     }
    //     for (let i = 255; i >= 0; i--) {
    //         closure(i);
    //     }
    //     this.drop(found);
    // }

    // eqRegister(target: StackItem, a: SimulatedRegister, b: SimulatedRegister) {
    //     this.setBit_1(target);
    //     for (let i = 0; i < 256; i++) {
    //         this.pick(a.stackItems[i]);
    //         this.pick(b.stackItems[i]);
    //         this.pushOpcode(OpcodeType.OP_EQUAL);
    //         this.pushOpcode(OpcodeType.OP_NOT);
    //         this.pick(target);
    //         this.pushOpcode(OpcodeType.OP_OR);
    //         this.replaceWithTop(target);
    //     }
    // }

    // private subRegister(target: SimulatedRegister, a: SimulatedRegister, b: SimulatedRegister) {
    //     const borrow = this.newStackItem();
    //     for (let i = 0; i < 255; i++) {
    //         this.subBit(target.stackItems[i], borrow, a.stackItems[i], b.stackItems[i]);
    //     }
    //     this.drop(borrow);
    // }

    // private addRegister(target: SimulatedRegister, a: SimulatedRegister, b: SimulatedRegister) {
    //     const carry = this.newStackItem();
    //     for (let i = 0; i < 255; i++) {
    //         this.addBit(target.stackItems[i], carry, a.stackItems[i], b.stackItems[i]);
    //     }
    //     this.ifBit(carry, () => this.setBit_1(target.stackItems[255]), () => this.setBit_0(target.stackItems[255]));
    //     this.drop(carry);
    // }

    // private addModRegister(target: SimulatedRegister, a: SimulatedRegister, b: SimulatedRegister, m: SimulatedRegister) {
    //     this.addRegister(target, a, b);
    //     const f = this.newStackItem();
    //     this.gtRegister(f, target, m);
    //     this.ifBit(f, () => this.subRegister(target, target, m), () => { });
    //     this.drop(f);
    // }

    // private andBitRegister(target: SimulatedRegister, a: SimulatedRegister, b: number, c: SimulatedRegister) {
    //     this.ifBit(a.stackItems[b], () => this.movRegister(target, c), () => this.clearRegister(target));
    // }

    // private mulRegister(target: SimulatedRegister, a: SimulatedRegister, b: number, c: SimulatedRegister) {
        
        
    //     // const agg = this.createRegisterOnStack();
    //     // this.mov(agg, a);
    //     // const r_temp = this.state.newRegister();
    //     // this.mov(target, this.R_0);
    //     // for (let bit = 0; bit < 256; bit++) {
    //     //     if (!b.hardcoded) {
    //     //         vm.andbit(r_temp, b, bit, agg);
    //     //         vm.add(target, target, r_temp, prime);
    //     //     } else if (b.getValue() & 2n ** BigInt(bit)) {
    //     //         vm.add(target, target, agg, prime);
    //     //     }    
    //     //     if (bit < 255) vm.add(agg, agg, agg, prime);
    //     // }
    // }

    // //********  BITSNARK OPS ***********/

    // addMod(target: number, a: number, b: number, p: number) {
    //     this.addModRegister(
    //         this.getSimulatedRegister(target),
    //         this.getSimulatedRegister(a),
    //         this.getSimulatedRegister(b),
    //         this.getSimulatedRegister(p)
    //     );
    // }

    // andBit(target: number, a: number, b: number, p: number) {
    //     this.andBitRegister(
    //         this.getSimulatedRegister(target),
    //         this.getSimulatedRegister(a),
    //         b,
    //         this.getSimulatedRegister(p)
    //     );
    // }

    // mov(target: number, a: number) {
    //     this.movRegister(
    //         this.getSimulatedRegister(target),
    //         this.getSimulatedRegister(a)
    //     );
    // }

    // eq(target: number, a: number, b: number) {
    //     this.eqRegister(
    //         this.getSimulatedRegister(target).stackItems[0],
    //         this.getSimulatedRegister(a),
    //         this.getSimulatedRegister(b)
    //     );
    // }

    // static generate(vm: VM, line: number) {

    //     const bitcoin = new Bitcoin();
    //     const instr = vm.instructions[line];

    //     console.log('instr: ', instr);

    //     const registers = [instr.target, ...instr.params];
    //     let newIndex = 0;
    //     for (let i = 0; i < registers.length; i++) {
    //         const r = registers[i];
    //         r.index = newIndex++;
    //         bitcoin.createRegisterOnStack(
    //             r.index,
    //             r.value);
    //     }

    //     switch (instr.name) {
    //         case InstrCode.ADDMOD:
    //             bitcoin.addMod(instr.target.index, instr.params[0].index, instr.params[1].index, instr.params[2].index);
    //             break;
    //         case InstrCode.ANDBIT:
    //             bitcoin.andBit(instr.target.index, instr.params[0].index, instr.bit ?? 0, instr.params[1].index);
    //             break;
    //         case InstrCode.EQUAL:
    //             bitcoin.eq(instr.target.index, instr.params[0].index, instr.params[1].index);
    //             break;
    //         case InstrCode.MOV:
    //             bitcoin.mov(instr.target.index, instr.params[0].index);
    //             break;

    //     }

    //     for (let i = 0; i < bitcoin.opcodes.length; i++) {
    //         const oc = bitcoin.opcodes[i];
    //         if (oc.op == OpcodeType.DATA) {
    //             console.log(`<${oc.data}>`);
    //         } else {
    //             console.log(`${oc.op}`);
    //         }
    //     }
    // }
}
