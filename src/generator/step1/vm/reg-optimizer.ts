import { Register } from "../../common/register";
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

export function regOptimizer(vm: VM) {

    const regArray: RichReg[] = vm.state.registers;

    console.log('Instruction count: ', vm.instructions.length);

    function mapReg(i: number, line: number) {
        const r = regArray[i];
        r.first = r.first ?? line;
        r.last = line;
        r.interval = r.last! - r.first!;
    }

    console.log('Find first and last uses');

    // find first and last for each register
    vm.instructions.forEach((instr, line) => {
        mapReg(instr.target, line);
        mapReg(instr.param1 ?? 0, line);
        mapReg(instr.param1 ?? 0, line);
    });

    console.log('Register optimization starting');

    const hardcoded = regArray.filter(r => r.hardcoded);
    const witness = regArray.filter(r => r.witness);
    const regular = regArray.filter(r => !r.witness && !r.hardcoded);

    console.log('total: ', regArray.length, ' hardcoded: ', hardcoded.length, ' withness: ', witness.length);;

    console.log('Sort by interval');

    // sort by size
    let sorted = Object.values(regular)
        .filter(r => !r.hardcoded && !r.witness)
        .sort((a, b) => b.interval! - a.interval!);

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

            counter++;
            if (counter % 10000000 == 0) {
                console.log(`sorted: ${sorted.length}   roots: ${roots.length}   group: ${group.length}    remaining: ${remaining.length}`);
            }
        }
        sorted = remaining;
    }

    console.log('Optimized register count: ', roots.length);

    console.log('Replace in instruction set');

    const remap: { [key: number]: Register } = {};
    roots.forEach(group => {
        group.forEach(r => {
            remap[r.index] = group[0];
        });
    });

    vm.instructions.forEach(instr => {
        instr.target = remap[instr.target].index;
        instr.param1 = remap[instr.param1 ?? 0].index;
        instr.param2 = remap[instr.param2 ?? 0].index;
    });

    console.log('Done');
}
