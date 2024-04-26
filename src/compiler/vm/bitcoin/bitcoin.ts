import { VM, InstrCode } from "../vm";
import { OpcodeType, sideEffects } from "./bitcoin-opcodes";
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

    constructor() {
    }

    /// BASIC ///

    private createRegisterOnStack(index: number, value: bigint): SimulatedRegister {
        const sr: SimulatedRegister = { index, stackItems: [], hardcoded: false };
        for (let i = 0; i < 256; i++) {
            this.pushOpcode(OpcodeType.DATA, value & 1n ? 1 : 0);
            value = value >> 1n;
            sr.stackItems.push(this.stack.top());
        }
        this.simulatedRegisters.set(index, sr);
        return sr;
    }

    private getSimulatedRegister(index: number): SimulatedRegister {
        const sr = this.simulatedRegisters.get(index);
        if (!sr) throw new Error(`Invalid register index: ${index}`);
        return sr;
    }

    private newStackItem(): StackItem {
        return this.stack.newItem();
    }

    private pushOpcode(code: OpcodeType, data?: number) {
        this.opcodes.push({ op: code, data });
        const delta = sideEffects[code];
        if (delta > 0) {
            for (let i = 0; i < delta; i++) this.stack.newItem();
        } else if (delta < 0) {
            for (let i = 0; i < -delta; i++) this.stack.pop();
        }
    }

    private getRelativeStackPosition(si: StackItem): number {
        const index = this.stack.findIndex(si);
        if (index === undefined) throw new Error('Invalid relative position');
        return this.stack.length() - index;
    }

    private roll(si: StackItem) {
        const rel = this.getRelativeStackPosition(si);
        this.pushOpcode(OpcodeType.DATA, rel);
        this.pushOpcode(OpcodeType.OP_ROLL);
        this.stack.roll(si);
    }

    private pick(si: StackItem) {
        const rel = this.getRelativeStackPosition(si);
        this.pushOpcode(OpcodeType.DATA, rel);
        this.pushOpcode(OpcodeType.OP_PICK);
        this.stack.pick(si);
    }

    private drop(si: StackItem) {
        this.roll(si);
        this.pushOpcode(OpcodeType.OP_DROP);
    }

    private replaceWithTop(target: StackItem) {
        this.roll(target);
        this.pushOpcode(OpcodeType.OP_DROP);
        this.stack.push(target);
    }

    /// StackItem operations //

    private setBit_1(target: StackItem) {
        this.pushOpcode(OpcodeType.OP_1);
        this.replaceWithTop(target);
    }

    private setBit_0(target: StackItem) {
        this.pushOpcode(OpcodeType.OP_1);
        this.replaceWithTop(target);
    }

    // private orBit(target: StackItem, a: StackItem, b: StackItem) {
    //     this.pick(a);
    //     this.pick(b);
    //     this.pushOpcode(OpcodeType.OP_OR);
    //     this.replaceWithTop(target);
    // }

    // private notBit(target: StackItem, a: StackItem) {
    //     this.pick(a);
    //     this.pushOpcode(OpcodeType.OP_NOT);
    //     this.replaceWithTop(target);
    // }

    private ifBit(flag: StackItem, fnthen?: () => void, fnelse?: () => void) {
        this.pick(flag);
        this.pushOpcode(OpcodeType.OP_IF);
        if (fnthen) fnthen();
        if (fnelse) {
            this.pushOpcode(OpcodeType.OP_ELSE);
            fnelse();
        }
        this.pushOpcode(OpcodeType.OP_ENDIF);
    }

    // private eqBit(target: StackItem, a: StackItem, b: StackItem) {
    //     this.pick(a);
    //     this.pick(b);
    //     this.pushOpcode(OpcodeType.OP_EQUAL);
    //     this.replaceWithTop(target);
    // }

    private addBit(target: StackItem, carry: StackItem, a: StackItem, b: StackItem) {
        const fns = {
            fff: () => { this.setBit_0(target); },
            fft: () => { this.setBit_1(target); },
            ftf: () => { this.setBit_1(target); },
            ftt: () => { this.setBit_1(carry); this.setBit_0(target); },
            tff: () => { this.setBit_0(carry); this.setBit_1(target); },
            tft: () => { this.setBit_0(target); },
            ttf: () => { this.setBit_0(target); },
            ttt: () => { this.setBit_1(target); }
        };
        this.ifBit(a, () =>
            this.ifBit(b,
                () => this.ifBit(carry, fns.ttt, fns.ftt),
                () => this.ifBit(carry, fns.tft, fns.ftf)),
            () =>
                this.ifBit(b,
                    () => this.ifBit(carry, fns.tft, fns.fft),
                    () => this.ifBit(carry, fns.tft, fns.fff)));
    }

    private subBit(target: StackItem, borrow: StackItem, a: StackItem, b: StackItem) {
        const fns = {
            fff: () => { this.setBit_0(target); },
            fft: () => { this.setBit_1(borrow); this.setBit_1(target); },
            ftf: () => { this.setBit_1(target); },
            ftt: () => { this.setBit_0(target); },
            tff: () => { this.setBit_1(target); },
            tft: () => { this.setBit_0(target); },
            ttf: () => { this.setBit_0(borrow); this.setBit_0(target); },
            ttt: () => { this.setBit_0(target); }
        };
        this.ifBit(a, () =>
            this.ifBit(b,
                () => this.ifBit(borrow, fns.ttt, fns.ftt),
                () => this.ifBit(borrow, fns.tft, fns.ftf)),
            () =>
                this.ifBit(b,
                    () => this.ifBit(borrow, fns.tft, fns.fft),
                    () => this.ifBit(borrow, fns.tft, fns.fff)));
    }

    /// Register operations ///

    private clearRegister(target: SimulatedRegister) {
        for (let i = 0; i < 256; i++) {
            this.pushOpcode(OpcodeType.OP_0);
            this.replaceWithTop(target.stackItems[i]);
        }
    }

    private movRegister(target: SimulatedRegister, a: SimulatedRegister) {
        for (let i = 0; i < 256; i++) {
            this.pick(a.stackItems[i]);
            this.replaceWithTop(target.stackItems[i]);
        }
    }

    private gtRegister(target: StackItem, a: SimulatedRegister, b: SimulatedRegister) {
        const found = this.newStackItem();
        this.setBit_0(target);
        const closure = (ti: number) => {
            this.ifBit(found, undefined, () => {
                this.ifBit(a.stackItems[ti],
                    () => this.ifBit(b.stackItems[ti], undefined, () => {
                        this.setBit_1(found);
                        this.setBit_1(target);
                    }),
                    () => this.ifBit(b.stackItems[ti], () => {
                        this.setBit_1(found);
                        this.setBit_0(target);
                    }, undefined));
            });
        }
        for (let i = 255; i >= 0; i--) {
            closure(i);
        }
        this.drop(found);
    }

    eqRegister(target: StackItem, a: SimulatedRegister, b: SimulatedRegister) {
        this.setBit_1(target);
        for (let i = 0; i < 256; i++) {
            this.pick(a.stackItems[i]);
            this.pick(b.stackItems[i]);
            this.pushOpcode(OpcodeType.OP_EQUAL);
            this.pushOpcode(OpcodeType.OP_NOT);
            this.pick(target);
            this.pushOpcode(OpcodeType.OP_OR);
            this.replaceWithTop(target);
        }
    }

    private subRegister(target: SimulatedRegister, a: SimulatedRegister, b: SimulatedRegister) {
        const borrow = this.newStackItem();
        for (let i = 0; i < 255; i++) {
            this.subBit(target.stackItems[i], borrow, a.stackItems[i], b.stackItems[i]);
        }
        this.drop(borrow);
    }

    private addRegister(target: SimulatedRegister, a: SimulatedRegister, b: SimulatedRegister) {
        const carry = this.newStackItem();
        for (let i = 0; i < 255; i++) {
            this.addBit(target.stackItems[i], carry, a.stackItems[i], b.stackItems[i]);
        }
        this.ifBit(carry, () => this.setBit_1(target.stackItems[255]), () => this.setBit_0(target.stackItems[255]));
        this.drop(carry);
    }

    private addModRegister(target: SimulatedRegister, a: SimulatedRegister, b: SimulatedRegister, m: SimulatedRegister) {
        this.addRegister(target, a, b);
        const f = this.newStackItem();
        this.gtRegister(f, target, m);
        this.ifBit(f, () => this.subRegister(target, target, m), () => { });
        this.drop(f);
    }

    private andBitRegister(target: SimulatedRegister, a: SimulatedRegister, b: number, c: SimulatedRegister) {
        this.ifBit(a.stackItems[b], () => this.movRegister(target, c), () => this.clearRegister(target));
    }

    private mulRegister(target: SimulatedRegister, a: SimulatedRegister, b: number, c: SimulatedRegister) {
        
        
        // const agg = this.createRegisterOnStack();
        // this.mov(agg, a);
        // const r_temp = this.state.newRegister();
        // this.mov(target, this.R_0);
        // for (let bit = 0; bit < 256; bit++) {
        //     if (!b.hardcoded) {
        //         vm.andbit(r_temp, b, bit, agg);
        //         vm.add(target, target, r_temp, prime);
        //     } else if (b.getValue() & 2n ** BigInt(bit)) {
        //         vm.add(target, target, agg, prime);
        //     }    
        //     if (bit < 255) vm.add(agg, agg, agg, prime);
        // }
    }

    //********  BITSNARK OPS ***********/

    addMod(target: number, a: number, b: number, p: number) {
        this.addModRegister(
            this.getSimulatedRegister(target),
            this.getSimulatedRegister(a),
            this.getSimulatedRegister(b),
            this.getSimulatedRegister(p)
        );
    }

    andBit(target: number, a: number, b: number, p: number) {
        this.andBitRegister(
            this.getSimulatedRegister(target),
            this.getSimulatedRegister(a),
            b,
            this.getSimulatedRegister(p)
        );
    }

    mov(target: number, a: number) {
        this.movRegister(
            this.getSimulatedRegister(target),
            this.getSimulatedRegister(a)
        );
    }

    eq(target: number, a: number, b: number) {
        this.eqRegister(
            this.getSimulatedRegister(target).stackItems[0],
            this.getSimulatedRegister(a),
            this.getSimulatedRegister(b)
        );
    }

    static generate(vm: VM, line: number) {

        const bitcoin = new Bitcoin();
        const instr = vm.instructions[line];

        console.log('instr: ', instr);

        const registers = [instr.target, ...instr.params];
        let newIndex = 0;
        for (let i = 0; i < registers.length; i++) {
            const r = registers[i];
            r.index = newIndex++;
            bitcoin.createRegisterOnStack(
                r.index,
                r.value);
        }

        switch (instr.name) {
            case InstrCode.ADDMOD:
                bitcoin.addMod(instr.target.index, instr.params[0].index, instr.params[1].index, instr.params[2].index);
                break;
            case InstrCode.ANDBIT:
                bitcoin.andBit(instr.target.index, instr.params[0].index, instr.bit ?? 0, instr.params[1].index);
                break;
            case InstrCode.EQUAL:
                bitcoin.eq(instr.target.index, instr.params[0].index, instr.params[1].index);
                break;
            case InstrCode.MOV:
                bitcoin.mov(instr.target.index, instr.params[0].index);
                break;

        }

        for (let i = 0; i < bitcoin.opcodes.length; i++) {
            const oc = bitcoin.opcodes[i];
            if (oc.op == OpcodeType.DATA) {
                console.log(`<${oc.data}>`);
            } else {
                console.log(`${oc.op}`);
            }
        }
    }
}
