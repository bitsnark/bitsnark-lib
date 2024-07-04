import { deleteDir } from "../../src/encoder-decoder/files-utils";
import { Lamport } from "../../src/encoder-decoder/lamport";
import { Bitcoin } from "../../src/generator/step3/bitcoin";
import { StackItem } from "../../src/generator/step3/stack";
import { strToBigint, writeBigintToBuffer, hash, bufferToBigints256, Key, bitsToBigint, nibblesToBigint, bufferToBigints256BE } from "./utils";

const testData32Bits = strToBigint('TEST');
const testData256Bits = strToBigint('TESTING1TESTING2TESTING3TESTING4');

const lamportKeys: Key[][] = [];
for (let i = 0; i < 256; i++) lamportKeys.push([
    { prvt: hash(BigInt(i), 1), pblc: hash(BigInt(i), 2) },
    { prvt: hash(1000000n + BigInt(i), 1), pblc: hash(1000000n + BigInt(i), 2) }
]);

function encodeLamportBit(target: Buffer, bitIndex: number, bit: number) {
    const t = bit == 0 ? lamportKeys[bitIndex][0].prvt : lamportKeys[bitIndex][1].prvt;
    const index = bitIndex * 32;
    writeBigintToBuffer(target, index, t, 32);
}

function encodeLamportBits(input: bigint, bits: number): Buffer {
    const hashSizeBytes = 32;
    let output = Buffer.alloc(bits * hashSizeBytes);
    for (let i = 0; i < bits; i++) {
        encodeLamportBit(output, i, Number(input & 1n));
        input = input >> 1n;
    }

    return output;
}

function encodeLamportBuffer(input: bigint, bits: number, lamport: Lamport) {
    const buffer = Buffer.alloc(bits);
    writeBigintToBuffer(buffer, 0, input, bits);
    return lamport.encodeBuffer(buffer, bits);
}

const winternitzKeys: Key[] = [];
for (let i = 0; i < 256; i++) winternitzKeys.push({ prvt: hash(BigInt(i)), pblc: hash(BigInt(i), 9) });

function toNibbles(input: bigint, count: number): number[] {
    const W = 3;
    const nibbles: number[] = [];
    for (let i = 0; i < count; i++) {
        let nibble = 0;
        for (let j = 0; j < W; j++) {
            nibble += Number(input & 1n) << j;
            input = input >> 1n;
        }
        nibbles.push(nibble);
    }
    return nibbles;
}

function encodeWinternitz(input: bigint, dataBits: number, checksumBits: number): Buffer {
    const W = 3;
    const checksumNibbles = Math.ceil(checksumBits / 3);
    const dataNibbles = Math.ceil(dataBits / W);
    const hashSizeBytes = 32;
    const outputSizeBytes = (dataNibbles + checksumNibbles) * hashSizeBytes;
    let output = Buffer.alloc(outputSizeBytes);
    let checksum = 0;
    toNibbles(input, dataNibbles).forEach((nibble, i) => {
        checksum += nibble;
        const t = 7 - nibble;
        writeBigintToBuffer(output, i * hashSizeBytes, hash(winternitzKeys[i].prvt, t), hashSizeBytes);
    });
    toNibbles(BigInt(checksum), checksumNibbles).forEach((nibble, i) => {
        writeBigintToBuffer(output, (dataNibbles + i) * hashSizeBytes, hash(winternitzKeys[dataNibbles + i].prvt, nibble), hashSizeBytes);
    });
    return output;
}

function generatLamport(folder: string, bits: number) {
    deleteDir(folder);
    const lamport = new Lamport(folder);
    lamport.generateKeys(bits);
    return lamport;
}
describe("encoding schemes", function () {

    let bitcoin: Bitcoin;
    let lamport: Lamport;
    let encoded;
    let witness: StackItem[];
    let decodedItems: StackItem[];


    describe('lamport 32 bits', () => {

        let keyItems: bigint[][];

        beforeEach(() => {
            bitcoin = new Bitcoin();

            lamport = generatLamport('lamport32', 32);
            const buffer = Buffer.alloc(4);
            writeBigintToBuffer(buffer, 0, testData32Bits, 4);
            const { encodedData, pubk } = lamport.encodeBufferAddPublic(buffer, 0);
            encoded = encodedData;

            witness = bufferToBigints256BE(encoded).map(n => bitcoin.addWitness(n));


            keyItems = [];
            for (let i = 0; i < 32; i++) {
                keyItems.push(
                    [
                        bufferToBigints256BE(pubk.subarray(i * 64, i * 64 + 32))[0],
                        bufferToBigints256BE(pubk.subarray(i * 64 + 32, (i + 1) * 64))[0]
                    ]);
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

            lamport = generatLamport('lamport256', 256);
            const buffer = Buffer.alloc(32);
            writeBigintToBuffer(buffer, 0, testData256Bits, 32);
            const { encodedData, pubk } = lamport.encodeBufferAddPublic(buffer, 0);
            encoded = encodedData;

            witness = bufferToBigints256BE(encoded).map(n => bitcoin.addWitness(n));
            keyItems = [];
            for (let i = 0; i < 256; i++) {
                keyItems.push(
                    [
                        bufferToBigints256BE(pubk.subarray(i * 64, i * 64 + 32))[0],
                        bufferToBigints256BE(pubk.subarray(i * 64 + 32, (i + 1) * 64))[0]
                    ]);
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
            encoded = encodeWinternitz(testData32Bits, 32, 9);
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
            encoded = encodeWinternitz(testData256Bits, 256, 12);
            witness = bufferToBigints256(encoded).map(n => bitcoin.addWitness(n));
            keyItems = [];
            for (let i = 0; i < 86 + 4; i++) {
                keyItems.push(winternitzKeys[i].pblc);
            }
            decodedItems = [];
            for (let i = 0; i < 86 + 4; i++) decodedItems.push(bitcoin.newStackItem(0n));
        });

        it("positive", async () => {
            bitcoin.winternitzDecode256(decodedItems, witness, keyItems);
            expect(bitcoin.success).toBe(true);
            const result = nibblesToBigint(decodedItems.slice(0, 86).map(si => Number(si.value)));
            expect(result).toEqual(testData256Bits);

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
