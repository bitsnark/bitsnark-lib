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

        values.forEach((v) =>
            ns.forEach((n) => {
                it(`${v} * ${n}`, () => {
                    bitcoin.newStackItem(v);
                    bitcoin.mul(n);
                    expect(Number(bitcoin.stack.top().value)).toBe(v * n);
                    bitcoin.OP_DROP();
                });
            })
        );
    });

    describe('programToBinary', () => {
        it('will not throw', () => {
            bitcoin.OP_0_16(0);
            expect(() => bitcoin.programToBinary({ validateStack: false })).not.toThrow();
        });
    });

    describe('script number encoding', () => {
        const getBuffer = () => bitcoin.programToBinary({ validateStack: false });

        it('should encode 0 as OP_0', () => {
            bitcoin.DATA(0);
            expect(bitcoin.stack.top().value).toBe(0);
            const expected = Buffer.from([0x00]);
            expect(getBuffer()).toStrictEqual(expected);
        });

        it('should encode 1 as OP_1', () => {
            bitcoin.DATA(1);
            expect(bitcoin.stack.top().value).toBe(1);
            const expected = Buffer.from([81]);
            expect(getBuffer()).toStrictEqual(expected);
        });

        it('should encode 16 as OP_16', () => {
            bitcoin.DATA(16);
            expect(bitcoin.stack.top().value).toBe(16);
            const expected = Buffer.from([96]);
            expect(getBuffer()).toStrictEqual(expected);
        });

        it('should encode 17 using the minimally encoded script number format', () => {
            bitcoin.DATA(17);
            expect(bitcoin.stack.top().value).toBe(17);
            const expected = Buffer.from([0x01, 17]);
            expect(getBuffer()).toStrictEqual(expected);
        });

        it('should encode 127 as one byte using the minimally encoded script number format', () => {
            bitcoin.DATA(127);
            expect(bitcoin.stack.top().value).toBe(127);
            const expected = Buffer.from([0x01, 127]);
            expect(getBuffer()).toStrictEqual(expected);
        });

        it('should encode 128 as two bytes using the minimally encoded script number format', () => {
            bitcoin.DATA(128);
            expect(bitcoin.stack.top().value).toBe(128);
            const expected = Buffer.from([0x02, 128, 0x00]);
            expect(getBuffer()).toStrictEqual(expected);
        });

        it('should encode 0x7fff using the minimally encoded script number format', () => {
            bitcoin.DATA(0x7fff);
            expect(bitcoin.stack.top().value).toBe(0x7fff);
            const expected = Buffer.from([0x02, 0xff, 0x7f]);
            expect(getBuffer()).toStrictEqual(expected);
        });

        it('should encode 0x8000 using the minimally encoded script number format', () => {
            bitcoin.DATA(0x8000);
            expect(bitcoin.stack.top().value).toBe(0x8000);
            const expected = Buffer.from([0x03, 0x00, 0x80, 0x00]);
            expect(getBuffer()).toStrictEqual(expected);
        });

        it('should encode 0xfffe using the minimally encoded script number format', () => {
            bitcoin.DATA(0xfffe);
            expect(bitcoin.stack.top().value).toBe(0xfffe);
            const expected = Buffer.from([0x03, 0xfe, 0xff, 0x00]);
            expect(getBuffer()).toStrictEqual(expected);
        });
    });
});
