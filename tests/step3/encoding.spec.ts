import { Bitcoin } from "../../src/generator/step3/bitcoin";
import { StackItem } from "../../src/generator/step3/stack";
import { strToBigint, bufferToBigints256, bitsToBigint, nibblesToBigint, encodeLamportBits, encodeWinternitz, lamportKeys, winternitzKeys } from "../encoding";

const testData32Bits = strToBigint('TEST');
const testData256Bits = strToBigint('TESTING1TESTING2TESTING3TESTING4');

describe("encoding schemes", function () {

    let bitcoin: Bitcoin;
    let encoded;
    let witness: StackItem[];
    let decodedItems: StackItem[];

    describe('lamport 32 bits', () => {

        let keyItems: bigint[][];

        beforeEach(() => {
            bitcoin = new Bitcoin();
            encoded = encodeLamportBits(testData32Bits, 32);
            witness = bufferToBigints256(encoded).map(n => bitcoin.addWitness(n));
            keyItems = [];
            for (let i = 0; i < 32; i++) {
                keyItems.push(lamportKeys[i].map(k => k.pblc));
            }
            decodedItems = [];
            for (let i = 0; i < 32; i++) decodedItems.push(bitcoin.newStackItem(0n));
        });

        it("positive", async () => {

            bitcoin.lamportDecode(decodedItems, witness, keyItems);
            expect(bitcoin.success).toBe(true);
            const result = bitsToBigint(decodedItems.map(si => si.value ? 1 : 0));
            expect(result).toEqual(testData32Bits);

            console.log('32 bits in lamport encoding: ', encoded.length);
            console.log('32 bit lamport decode btc script count', bitcoin.opcodes.length);
            console.log('32 bit lamport decode btc script size', bitcoin.programSizeInBitcoinBytes());
        });

        it("negative", async () => {

            witness[0].value++;

            bitcoin.lamportDecode(decodedItems, witness, keyItems);
            expect(bitcoin.success).toBe(false);
        });
    });

    describe('lamport 256 bits', () => {

        let keyItems: bigint[][];

        beforeEach(() => {
            bitcoin = new Bitcoin();
            encoded = encodeLamportBits(testData256Bits, 256);
            witness = bufferToBigints256(encoded).map(n => bitcoin.addWitness(n));
            keyItems = [];
            for (let i = 0; i < 256; i++) {
                keyItems.push(lamportKeys[i].map(k => k.pblc));
            }
            decodedItems = [];
            for (let i = 0; i < 256; i++) decodedItems.push(bitcoin.newStackItem(0n));
        });

        it("positive", async () => {

            bitcoin.lamportDecode(decodedItems, witness, keyItems);
            expect(bitcoin.success).toBe(true);
            const result = bitsToBigint(decodedItems.map(si => si.value ? 1 : 0));
            expect(result).toEqual(testData256Bits);

            console.log('256 bits in lamport encoding: ', encoded.length);
            console.log('256 bit lamport decode btc script count', bitcoin.opcodes.length);
            console.log('256 bit lamport decode btc script', bitcoin.programSizeInBitcoinBytes());
        });

        it("negative", async () => {

            witness[0].value++;

            bitcoin.lamportDecode(decodedItems, witness, keyItems);
            expect(bitcoin.success).toBe(false);
        });
    });

    describe('winternitz 32 bits', () => {

        let keyItems: bigint[];

        beforeEach(() => {
            bitcoin = new Bitcoin();
            encoded = encodeWinternitz(testData32Bits, 0, 32, 9);
            witness = bufferToBigints256(encoded).map(n => bitcoin.addWitness(n));
            keyItems = [];
            for (let i = 0; i < 11 + 3; i++) {
                keyItems.push(winternitzKeys[i].pblc);
            }
            decodedItems = [];
            for (let i = 0; i < 11 + 3; i++) decodedItems.push(bitcoin.newStackItem(0n));
        });

        it("positive", async () => {
            bitcoin.winternitzDecode32(decodedItems, witness, keyItems);
            expect(bitcoin.success).toBe(true);
            const result = nibblesToBigint(decodedItems.slice(0, 11).map(si => Number(si.value)));
            expect(result).toEqual(testData32Bits);

            console.log('32 bits in winternitz encoding: ', encoded.length);
            console.log('32 bit winternitz decode btc script count', bitcoin.opcodes.length);
            console.log('32 bit winternitz decode btc script', bitcoin.programSizeInBitcoinBytes());
        });
        it("negative", async () => {

            witness[0].value++;

            bitcoin.winternitzDecode32(decodedItems, witness, keyItems);
            expect(bitcoin.success).toBe(false);
        });
    });

    describe('winternitz 256 bits', () => {

        let keyItems: bigint[];

        beforeEach(() => {
            bitcoin = new Bitcoin();
            encoded = encodeWinternitz(testData256Bits, 0, 256, 12);
            witness = bufferToBigints256(encoded).map(n => bitcoin.addWitness(n));
            keyItems = [];
            for (let i = 0; i < 86 + 4; i++) {
                keyItems.push(winternitzKeys[i].pblc);
            }
            decodedItems = [];
            for (let i = 0; i < 86 + 4; i++) decodedItems.push(bitcoin.newStackItem(0n));
        });

        it("positive", async () => {
            bitcoin.winternitzCheck256(witness, keyItems);
            expect(bitcoin.success).toBe(true);

            console.log('256 bits in winternitz encoding: ', encoded.length);
            console.log('256 bit winternitz decode btc script count', bitcoin.opcodes.length);
            console.log('256 bit winternitz decode btc script', bitcoin.programSizeInBitcoinBytes());
        });

        it("negative", async () => {

            witness[0].value++;

            bitcoin.winternitzDecode32(decodedItems, witness, keyItems);
            expect(bitcoin.success).toBe(false);
        });
    });
});
