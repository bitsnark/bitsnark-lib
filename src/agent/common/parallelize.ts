import { range } from "./array-utils";

const parallelFactor = 16;

export async function parallelize<Tin, Tout>(
    inputs: Tin[],
    fn: (input: Tin) => Promise<Tout>): Promise<Tout[]> {

    const results: Tout[] = [];
    const todo = range(0, inputs.length);
    let concurrent = 0;
    let quitter = false;
    while (!quitter && todo.length > 0) {
        const t = todo.pop()!;
        const input = inputs[t];
        concurrent++;
        console.log(`Starting work chunk ${t} of ${inputs.length}...`);
        fn(input)
            .then((result: Tout) => {
                console.log(`Finished work chunk ${t} of ${inputs.length}`);
                results[t] = result;
                concurrent--;
            }).catch(e => {
                console.error(e);
                quitter = true;
                throw e;
            });
        while (!quitter && concurrent >= parallelFactor) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    return results;
}
