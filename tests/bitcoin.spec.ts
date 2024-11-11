import { Bitcoin } from '../src/generator/step3/bitcoin';

describe('Bitcoin', () => {

    let bitcoin: Bitcoin;

	beforeEach(() => {
        bitcoin = new Bitcoin();
	});

	afterEach(() => {
		expect(bitcoin.success).toBeTruthy();
	});

	describe('mul on stack', () => {

        const values = [0, 1, 10, 243];
        const ns = [2, 3, 4, 5, 6, 7, 8, 16, 107, 255];

        values.forEach(v => ns.forEach(n => {
            it(`${v} * ${n}`, () => {
                bitcoin.newStackItem(v);
                bitcoin.mul(n);
                expect(Number(bitcoin.stack.top().value)).toBe(v * n);
                bitcoin.OP_DROP();
            });
        }));
    });
});

