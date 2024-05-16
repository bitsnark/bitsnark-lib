import { Register } from "../../common/register";
import { VM } from "./vm";

function isOverlap(r1: Register, r2: Register): boolean {
    return !(r1.last! < r2.first! || r2.last! < r1.first!);
}

function isNotInSieve(ref: Register, sieve: boolean[]): boolean {
    for (let i = ref.first!; i <= ref.last!; i++)
        if (sieve[i]) return false;
    return true;
}

function markSieve(ref: Register, sieve: boolean[]) {
    for (let i = ref.first!; i <= ref.last!; i++) sieve[i] = true;
}

export function regOptimizer(vm: VM) {

    const allRegMap: { [key: number]: Register } = {};

    console.log('Instruction count: ', vm.instructions.length);

    function mapReg(r: Register, line: number) {
        if (!allRegMap[r.key]) {
            allRegMap[r.key] = r;
        }
        r.first = r.first ?? line;
        r.last = line;
        r.interval = r.last! - r.first!;
    }

    console.log('Find first and last uses');

    // find first and last for each register
    vm.instructions.forEach((instr, line) => {
        mapReg(instr.target, line);
        instr.params.forEach(r => mapReg(r, line));
    });

    console.log('Register optimization starting, count: ', Object.values(allRegMap).length);

    console.log('Sort by interval');

    // sort by size
    let sorted = Object.values(allRegMap)
        .filter(r => !r.hardcoded)
        .sort((a, b) => b.interval! - a.interval!);

    let hardcoded = Object.values(allRegMap)
        .filter(r => r.hardcoded);

    console.log('Hardcoded register count: ', hardcoded.length);

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
    const newRegs: Register[] = [];

    roots.forEach((ra, i) => {
        const newR = new Register();
        newRegs.push(newR);
        ra.forEach(r => remap[r.key] = newR);
    });

    hardcoded.forEach(r => remap[r.key!] = r);

    vm.instructions.forEach(instr => {
        instr.target = remap[instr.target.key!];
        instr.params = instr.params.map(r => remap[r.key!]);
    });

    console.log('Done');
}
