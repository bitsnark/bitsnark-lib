import { Register } from "./state";
import { VM } from "./vm";

interface RegRef {
    first: number;
    last: number;
    interval: number;
    reg: Register;
}

function isOverlap(r1: RegRef, r2: RegRef): boolean {
    return !(r1.last < r2.first || r2.last < r1.first);
}

function isNotInSieve(ref: RegRef, sieve: boolean[]): boolean {
    for (let i = ref.first; i <= ref.last; i++)
        if(sieve[i]) return false;
    return true;
}

function markSieve(ref: RegRef, sieve: boolean[]) {
    for (let i = ref.first; i <= ref.last; i++) sieve[i] = true;
}

export function regOptimizer(vm: VM) {

    const map: { [key: number]: RegRef } = {};
    function mapReg(r: Register, line: number) {
        if (!map[r.index]) map[r.index] = { reg: r, first: line, last: line, interval: 0 };
        const ref = map[r.index];
        ref.last = line;
        ref.interval = ref.last - ref.first;
    }

    // find first and last for each register
    vm.instructions.forEach((instr, line) => {
        mapReg(instr.target, line);
        instr.params.forEach(r => mapReg(r, line));
    });

    // sort by size
    let sorted = Object.values(map)
        .filter(ref => !ref.reg.hardcoded)
        .sort((a, b) => b.interval - a.interval);

    const roots = [];
    let counter = 0;

    // find non-overlapping
    while (sorted.length > 0) {
        const group: RegRef[] = [];
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
            if(counter % 10000000 == 0) {
                console.log(`sorted: ${sorted.length}   roots: ${roots.length}   group: ${group.length}    remaining: ${remaining.length}`);
            }
        }
        sorted = remaining;
    }

    console.log('Optimized register count: ', roots.length);
}
