const PARTS = 2;
const THRESH = 1;
const AGENTS = 200;
const SECRETS = 2048;

interface Secret {
    s: number;
    p: number;
    b: boolean;
}

function makeRand(): boolean[] {
    const ba: boolean[] = [];
    for (let i = 0; i < SECRETS; i++) {
        ba.push(Math.random() > 0.5);
    }
    return ba;
}

const agents: Secret[][] = [];
for (let i = 0; i < AGENTS; i++) agents[i] = [];
const aindex = 0;
for (let i = 0; i < SECRETS; i++) {
    for (let j = 0; j < 2; j++) {
        for (let k = 0; k < PARTS; k++) {
            const secret = { s: i, p: k, b: j == 1 };
            const agent = j * (AGENTS / 2) + Math.floor((Math.random() * AGENTS) / 2);
            // const agent = Math.floor(Math.random() * AGENTS);
            // const agent = (aindex++) % AGENTS;
            agents[agent] = agents[agent] ?? [];
            agents[agent].push(secret);
        }
    }
}

console.log(
    'agents: ',
    agents.map((a) => a.length)
);

function brute() {
    const acc: any = {};
    for (let i = 0; i < SECRETS; i++) {
        for (let j = 0; j < 2; j++) {
            acc[`${i},${j > 0}`] = 0;
        }
    }

    for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        for (let j = 0; j < agent.length; j++) {
            const s = agent[j];
            acc[`${s.s},${s.b}`] = (acc[`${s.s},${s.b}`] ?? 0) + 1;
        }
    }
    // console.log('acc: ', acc);
    return Object.values(acc).every((a: any) => a >= THRESH);
}

function open(r: boolean[]) {
    const acc: number[] = new Array(SECRETS).fill(0);
    for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        for (let j = 0; j < agent.length; j++) {
            const s = agent[j];
            if (s.b == r[s.s]) acc[s.s] = (acc[s.s] ?? 0) + 1;
        }
    }
    // console.log('acc: ', acc);
    return acc.every((a: any) => a >= THRESH);
}

for (let i = 0; i < agents.length; i++) {
    const bruted = brute();

    let counter = 0;
    let found = false;
    for (let j = 0; j < 10000000; j++) {
        const r = makeRand();
        const opened = open(r);
        // console.log('i', i, 'opened: ', opened);
        counter = j;
        if (opened) {
            found = true;
            break;
        }
    }
    if (!found) break;
    console.log('i', i, 'bruted: ', bruted, 'counter', counter);
    agents[i] = [];
}
