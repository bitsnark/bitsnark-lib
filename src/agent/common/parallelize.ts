import { range } from './array-utils';
import { sleep } from './sleep';

const parallelFactor = 16;

export async function parallelize<Tin, Tout>(inputs: Tin[], fn: (input: Tin) => Promise<Tout>): Promise<Tout[]> {
    const results: Tout[] = [];
    const todo = range(0, inputs.length);
    let concurrent = 0;
    let done = 0;
    while (done < inputs.length) {
        if (todo.length == 0 || concurrent >= parallelFactor) {
            await sleep(100);
            continue;
        }
        const t = todo.pop()!;
        const input = inputs[t];
        concurrent++;
        console.log(`Starting work chunk ${t} of ${inputs.length}...`);
        fn(input)
            .then((result: Tout) => {
                console.log(`Finished work chunk ${t} of ${inputs.length}`);
                results[t] = result;
                concurrent--;
                done++;
            })
            .catch((e) => {
                console.error(e);
                throw e;
            });
    }
    return results;
}
