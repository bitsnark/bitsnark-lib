import { deleteDir } from "../../src/encoder-decoder/files-utils";
import { Lamport } from "../../src/encoder-decoder/lamport";
import { Winternitz } from "../../src/encoder-decoder/winternitz";
import { bigintToBufferBE, bitsToBigint, bufferToBigints256BE, bufferToBigintsBE, hash, Key, nibblesToBigint, strToBigint } from "../../src/encoding/encoding";
import { Bitcoin } from "../../src/generator/step3/bitcoin";
import { StackItem } from "../../src/generator/step3/stack";
import { createHash } from "node:crypto";

const testData32Bits = strToBigint('TEST');
const testData256Bits = strToBigint('TESTING1TESTING2TESTING3TESTING4');

function generatLamport(folder: string, bits: number) {
    deleteDir(folder);
    const lamport = new Lamport(folder);
    lamport.generateKeys(bits);
    return lamport;
}

function generatWinternitz(folder: string) {
    deleteDir(folder);
    const winternitz = new Winternitz(folder);
    winternitz.generateKeys(1, 1);
    return winternitz;
}

describe("encoding schemes", function () {
    let bitcoin: Bitcoin;
    let lamport: Lamport;
    let winternitz: Winternitz;
    let encoded;
    let witness: StackItem[];
    let decodedItems: StackItem[];

    let keyHashed

    describe('lamport 32 bits', () => {
        let keyItems: bigint[][];

        beforeEach(() => {
            bitcoin = new Bitcoin();

            lamport = generatLamport('lamport32', 32);
            const buffer = bigintToBufferBE(testData32Bits, 4);
            const { pubk, encodedData } = lamport.encodeBufferAddPublic(buffer, 0);
            encoded = encodedData;

            witness = bufferToBigints256BE(encoded).map(n => bitcoin.addWitness(n));
            const allKeysBn = bufferToBigints256BE(pubk);

            keyItems = [];
            for (let i = 0; i < 32; i++) {
                keyItems.push([allKeysBn[i * 2], allKeysBn[i * 2 + 1]]);
            }

            decodedItems = [];
            for (let i = 0; i < 32; i++) decodedItems.push(bitcoin.newStackItem(0n));
        });

        it("hash decoded", () => {
            for (let i = 0; i < 32; i++) {
                let hex = witness[i].value.toString(16);
                while (hex.length < 64) hex = '0' + hex;
                const h = createHash('sha256').update(hex, 'hex').digest('hex');
                keyHashed = BigInt('0x' + h)
                const flag = keyHashed === keyItems[i][0] || keyHashed === keyItems[i][1]
                expect(flag).toBe(true);
            }
        });

        it("positive", () => {
            bitcoin.lamportDecode(decodedItems, witness, keyItems);
            expect(bitcoin.success).toBe(true);
            const result = bitsToBigint(decodedItems.map(si => si.value ? 1 : 0));
            const fixResult = bufferToBigintsBE(bigintToBufferBE(result, 4).reverse(), 4);
            expect(fixResult[0]).toEqual(testData32Bits);

            console.log('32 bits in lamport encoding: ', encoded.length);
            console.log('32 bit lamport decode btc script count', bitcoin.opcodes.length);
            console.log('32 bit lamport decode btc script size', bitcoin.programSizeInBitcoinBytes());
        });

        it("negative", () => {
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
            const buffer = bigintToBufferBE(testData256Bits, 32);
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

        it("positive", () => {
            bitcoin.lamportDecode(decodedItems, witness, keyItems);
            expect(bitcoin.success).toBe(true);
            const result = bitsToBigint(decodedItems.map(si => si.value ? 1 : 0));
            const fixResult = bufferToBigintsBE(bigintToBufferBE(result, 32).reverse(), 4);
            expect(fixResult[0]).toEqual(testData256Bits);

            console.log('256 bits in lamport encoding: ', encoded.length);
            console.log('256 bit lamport decode btc script count', bitcoin.opcodes.length);
            console.log('256 bit lamport decode btc script', bitcoin.programSizeInBitcoinBytes());
        });

        it("negative", () => {
            witness[0].value++;
            bitcoin.lamportDecode(decodedItems, witness, keyItems);
            expect(bitcoin.success).toBe(false);
        });
    });

    describe('winternitz 32 bits', () => {
        let keyItems: bigint[];

        beforeEach(() => {
            bitcoin = new Bitcoin();
            winternitz = generatWinternitz('winternitz32');
            const buffer = bigintToBufferBE(testData32Bits, 4);
            const { encodedData, pubk } = winternitz.encodeBuffer4AddPublic(buffer, 0);
            encoded = encodedData;
            witness = bufferToBigints256BE(encoded).map(n => bitcoin.addWitness(n));

            keyItems = [];
            for (let i = 0; i < 11 + 3; i++) {
                keyItems.push(
                    bufferToBigints256BE(pubk.subarray(i * 32, (i + 1) * 32))[0]
                );
            }
            decodedItems = [];
            for (let i = 0; i < 11 + 3; i++) decodedItems.push(bitcoin.newStackItem(0n));
        });

        it("positive", () => {
            bitcoin.winternitzCheck32(witness, keyItems);
            expect(bitcoin.success).toBe(true);
            bitcoin.winternitzDecode32(decodedItems, witness, keyItems);
            expect(bitcoin.success).toBe(true);
            const result = nibblesToBigint(decodedItems.slice(0, 11).map(si => Number(si.value)));
            const fixResult = bufferToBigintsBE(bigintToBufferBE(result, 4).reverse(), 4);
            expect(fixResult[0]).toEqual(testData32Bits);

            console.log('32 bits in winternitz encoding: ', encoded.length);
            console.log('32 bit winternitz decode btc script count', bitcoin.opcodes.length);
            console.log('32 bit winternitz decode btc script', bitcoin.programSizeInBitcoinBytes());
        });
        it("negative", () => {
            witness[0].value++;
            bitcoin.winternitzDecode32(decodedItems, witness, keyItems);
            expect(bitcoin.success).toBe(false);
        });
    });

    describe('winternitz 256 bits', () => {

        let keyItems: bigint[];

        beforeEach(() => {
            bitcoin = new Bitcoin();
            winternitz = generatWinternitz('winternitz256');
            const buffer = bigintToBufferBE(testData256Bits, 32);
            const { encodedData, pubk } = winternitz.encodeBuffer32AddPublic(buffer, 0);
            encoded = encodedData;
            witness = bufferToBigints256BE(encoded).map(n => bitcoin.addWitness(n));

            keyItems = [];
            for (let i = 0; i < 86 + 4; i++) {
                keyItems.push(
                    bufferToBigints256BE(pubk.subarray(i * 32, (i + 1) * 32))[0]
                );

            }
            decodedItems = [];
            for (let i = 0; i < 86 + 4; i++) decodedItems.push(bitcoin.newStackItem(0n));
        });

        it("positive", () => {
            bitcoin.winternitzCheck256(witness, keyItems);
            expect(bitcoin.success).toBe(true);

            console.log('256 bits in winternitz encoding: ', encoded.length);
            console.log('256 bit winternitz decode btc script count', bitcoin.opcodes.length);
            console.log('256 bit winternitz decode btc script', bitcoin.programSizeInBitcoinBytes());
        });

        it("negative", () => {
            witness[0].value++;
            bitcoin.winternitzDecode32(decodedItems, witness, keyItems);
            expect(bitcoin.success).toBe(false);
        });
    });
});
