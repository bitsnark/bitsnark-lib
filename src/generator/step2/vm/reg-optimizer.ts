import { Register } from "../../common/register";
import { InstrCode, Instruction } from "./types";
import { VM } from "./vm";

interface RichReg {
    value: bigint;
    hardcoded: boolean;
    witness: boolean;
    index: number;
    last?: number;
    first?: number;
    interval?: number;
}

function isOverlap(r1: RichReg, r2: RichReg): boolean {
    return !(r1.last! < r2.first! || r2.last! < r1.first!);
}

function isNotInSieve(ref: RichReg, sieve: boolean[]): boolean {
    for (let i = ref.first!; i <= ref.last!; i++)
        if (sieve[i]) return false;
    return true;
}

function markSieve(ref: RichReg, sieve: boolean[]) {
    for (let i = ref.first!; i <= ref.last!; i++) sieve[i] = true;
}

function check(regs: Register[], instructions: Instruction[]) {
    const ra: boolean[] = [];
    regs.forEach((r, i) => {
        if (r.index != i) throw new Error('Check failed 0');
        if (r.hardcoded || r.witness) ra[r.index] = true;
    });
    instructions.forEach(instr => {
        if (!ra[instr.param1]) 
            throw new Error('Check failed 1');
        switch (instr.name) {
            case InstrCode.ADDMOD:
            case InstrCode.ANDBIT:
            case InstrCode.ANDNOTBIT:
            case InstrCode.EQUAL:
            case InstrCode.MULMOD:
            case InstrCode.OR:
            case InstrCode.AND:
            case InstrCode.SUBMOD:
            case InstrCode.DIVMOD:
                if (!ra[instr.param2 ?? -1]) 
                    throw new Error('Check failed 2');
        }
        ra[instr.target] = true;
    });
}

export function regOptimizer(vm: VM) {

    check(vm.registers, vm.instructions);

    const regArray: RichReg[] = vm.registers;

    console.log('Instruction count: ', vm.instructions.length);

    function mapReg(i: number, line: number) {
        const r = regArray[i];
        r.first = r.witness ? 0 : r.first ?? line;
        r.last = line;
        r.interval = r.last! - r.first!;
    }

    console.log('Find first and last uses');

    // find first and last for each register
    vm.instructions.forEach((instr, line) => {
        mapReg(instr.target, line);
        mapReg(instr.param1, line);
        mapReg(instr.param2 ?? 0, line);
    });

    console.log('Register optimization starting');

    const hardcoded = regArray.filter(r => r.hardcoded);
    const witness = regArray.filter(r => r.witness);
    const dynamic = regArray.filter(r => !r.hardcoded && !r.witness);

    console.log('total: ', regArray.length, ' hardcoded: ', hardcoded.length, ' withness: ', witness.length);;

    console.log('Sort by interval');

    // sort by size
    let sorted = Object.values(dynamic)
        .sort((a, b) => b.interval! - a.interval!);
    sorted = [...witness, ...sorted];

    const roots = [];
    let counter = 0;

    console.log('Find non-overlapping sets');

    // find non-overlapping
    while (sorted.length > 0) {
        const group: Register[] = [];
        roots.push(group);
        const remaining = [];
        const sieve: boolean[] = new Array(vm.instructions.length);

        for (let i = 0; i < sorted.length; i++) {
            const ref = sorted[i];
            if (isNotInSieve(ref, sieve)) {
                markSieve(ref, sieve);
                group.push(ref);
            } else {
                remaining.push(ref);
            }

            // counter++;
            // if (counter % 10000000 == 0) {
            //     console.log(`sorted: ${sorted.length}   roots: ${roots.length}   group: ${group.length}    remaining: ${remaining.length}`);
            // }
        }
        sorted = remaining;
    }

    console.log('Optimized register count: ', roots.length);

    console.log('Replace in instruction set');

    const remap: { [key: number]: number } = {};
    const newRegs: Register[] = [...hardcoded];
    newRegs.forEach((r, i) => {
        remap[i] = i;
        r.index = i;
    });
    roots.forEach(group => {
        const r = {
            value: 0n,
            hardcoded: false,
            witness: group[0].witness,
            index: 0
        };
        newRegs.push(r);
        r.index = newRegs.length - 1;
        group.forEach(tr => {
            remap[tr.index] = r.index;
        });
    });

    vm.instructions.forEach(instr => {
        instr.target = remap[instr.target];
        instr.param1 = remap[instr.param1];
        instr.param2 = remap[instr.param2 ?? 0];
    });

    vm.registers = newRegs;

    check(newRegs, vm.instructions);

    console.log('Done');
}
