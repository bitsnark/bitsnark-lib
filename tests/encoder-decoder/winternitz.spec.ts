import { createHash } from "crypto";
import { isFileExists, deleteDir, getFileSizeBytes } from "../../src/encoder-decoder/files-utils";
import { Winternitz } from "../../src/encoder-decoder/winternitz";

const dataBuffer32 = Buffer.from([
    0xe2, 0x9d, 0xc3, 0x72, 0x89, 0x5d, 0x18, 0x5d,
    0xa9, 0x1a, 0x8b, 0x68, 0x5f, 0xe9, 0xf3, 0x27,
    0x91, 0xc5, 0x0e, 0xe3, 0x3d, 0x93, 0x8a, 0x1b,
    0x11, 0x0b, 0xf4, 0x73, 0x7a, 0x63, 0x6b, 0xb7
]);

const dataBuffer4 = Buffer.from([
    0x00, 0x45, 0xfc, 0xff, 0xff, 0x00,
    0x4e, 0x0f, 0xbb, 0x61, 0x84, 0x7d
]);


const PRV_KEY_FILE = "prv.bin";
const PUB_KEY_FILE = "pub.bin";
export const FILE_PREFIX_32 = "winternitz-32-";
export const FILE_PREFIX_4 = "winternitz-4-";
const chunckSize32 = 32;
const chunckSize4 = 4;
const hashSize = 32;


const totalChuncks32 = dataBuffer32.length / chunckSize32;
const totalChuncks4 = dataBuffer4.length / chunckSize4;


function getDataBufferToEncode(data: Buffer, byteIndex: number, length: number): Buffer {
    return Buffer.from(data.subarray(byteIndex, byteIndex + length));
}

function hashSubKey(data: Buffer, byteIndex: number): Buffer {
    const newData = Buffer.from(data);
    let subBuffer = Buffer.from(data.subarray(byteIndex, byteIndex + hashSize));
    subBuffer = createHash('sha256').update(subBuffer).digest();
    subBuffer.copy(newData, byteIndex, 0, hashSize);
    return newData;
}

describe(`Test sequence for winternitz signature`, () => {
    const folder = `winternitz`;

    beforeAll(() => {
        deleteDir(folder);
    });

    const winternitz = new Winternitz(folder);

    it('Create Winternitz class instance', () => {
        expect(winternitz).toBeInstanceOf(Winternitz);
    });

    it('Generate keys - returning 4 files location ', () => {
        winternitz.generateKeys(dataBuffer32.length / chunckSize32, dataBuffer4.length / chunckSize4);
    });

    it(`Check that a 4 file was added to ${folder}`, () => {
        expect(isFileExists(folder, `${FILE_PREFIX_32}${PRV_KEY_FILE}`)).toBe(true);
        expect(isFileExists(folder, `${FILE_PREFIX_4}${PRV_KEY_FILE}`)).toBe(true);
        expect(isFileExists(folder, `${FILE_PREFIX_32}${PUB_KEY_FILE}`)).toBe(true);
        expect(isFileExists(folder, `${FILE_PREFIX_4}${PUB_KEY_FILE}`)).toBe(true);
    });

    it(`Size of all four 32byte data files is correct`, () => {
        expect(getFileSizeBytes(folder, `${FILE_PREFIX_32}${PRV_KEY_FILE}`)).toBe(totalChuncks32 * 90 * hashSize);
        expect(getFileSizeBytes(folder, `${FILE_PREFIX_32}${PUB_KEY_FILE}`)).toBe(totalChuncks32 * 90 * hashSize);
    });

    it(`Size of all four 4byte data files is correct`, () => {
        expect(getFileSizeBytes(folder, `${FILE_PREFIX_4}${PRV_KEY_FILE}`)).toBe(totalChuncks4 * 14 * hashSize);
        expect(getFileSizeBytes(folder, `${FILE_PREFIX_4}${PUB_KEY_FILE}`)).toBe(totalChuncks4 * 14 * hashSize);
    });

    it('Throw an error on a second attempt to generate keys for the same folder', () => {
        expect(() => { winternitz.generateKeys(dataBuffer32.length, dataBuffer4.length); }).toThrow();
    });

    const dataToEncode4 = getDataBufferToEncode(dataBuffer4, 0, 4);
    let encoded4: Buffer;
    it('Encode: recive 4 bytes of data, return (3 + 11) * 32 (hash * ( nibbles in chunckSize4 + 2checksum)) = 448 encoded', () => {
        encoded4 = winternitz.encodeBuffer4(dataToEncode4, 0);
        expect(encoded4.length).toBe(hashSize * (3 + 11));
    });

    let decoded4: Buffer;
    it(`Decode: buffer4 data was decoded`, () => {
        decoded4 = winternitz.decodeBuffer4(encoded4, 0);
        expect(Buffer.from(decoded4).compare(dataToEncode4.subarray(0, chunckSize4))).toBe(0);
    });

    it(`Decode: change hash - buffer4 data was not decoded and error was thrown`, () => {
        const tmpEncoded4 = encoded4;
        tmpEncoded4[0] = tmpEncoded4[0] + 1;
        expect(() => { winternitz.decodeBuffer4(tmpEncoded4, 0); }).toThrow('Invalid key');
    });

    it(`Decode: change checksum - buffer4 data was not decoded and error was thrown`, () => {
        encoded4 = winternitz.encodeBuffer4(dataToEncode4, 0);
        const tmpEncoded4 = hashSubKey(encoded4, hashSize * 11);
        expect(() => { winternitz.decodeBuffer4(tmpEncoded4, 0); }).toThrow('Invalid checksum');
    });

    it(`Decode: same block data buffer4 if just like cache`, () => {
        decoded4 = winternitz.decodeBuffer4(encoded4, 0);
        expect(Buffer.from(decoded4).compare(dataToEncode4.subarray(0, chunckSize4))).toBe(0);
    });

    it(`Decode: new block data buffer4 (2) is decoded ok`, () => {
        const tmpEncoded4 = winternitz.encodeBuffer4(getDataBufferToEncode(dataBuffer4, 8, 4), 2);
        const tmpDecoded4 = winternitz.decodeBuffer4(tmpEncoded4, 2);
        expect(Buffer.from(tmpDecoded4).compare(getDataBufferToEncode(dataBuffer4, 8, 4))).toBe(0);

    });

    it(`Decode throws cache error if same block data buffer has different cache`, () => {
        const tmpEncoded4 = winternitz.encodeBuffer4(Buffer.from([0x3b, 0x61, 0x84, 0x71]), 2);
        expect(() => { winternitz.decodeBuffer4(tmpEncoded4, 2); }).toThrow('Conflict detected in cache file');

    });


    const dataToEncode32 = getDataBufferToEncode(dataBuffer32, 0, 32);
    let encoded32: Buffer;
    it('Encode: recive 32 bytes of data, return (4 + 86) * 32 (hash * (nibbles in chunckSize32 + 2checksum) = 2880 encoded', () => {
        encoded32 = winternitz.encodeBuffer32(dataToEncode32, 0);
        expect(encoded32.length).toBe(hashSize * (4 + 86));
    });


    let decoded32: Buffer;
    it(`Decode: buffer32 data was decoded`, () => {
        decoded32 = winternitz.decodeBuffer32(encoded32, 0);
        expect(Buffer.from(decoded32).compare(dataToEncode32.subarray(0, chunckSize32))).toBe(0);
    });

    it(`Decode: if buffer32 data was decoded`, () => {
        decoded32 = winternitz.decodeBuffer32(encoded32, 0);
        expect(Buffer.from(decoded32).compare(dataToEncode32.subarray(0, chunckSize32))).toBe(0);
    });

    it(`Decode: change hash - buffer32 data was not decoded and error was thrown`, () => {
        const tmpEncoded32 = encoded32;
        tmpEncoded32[0] = tmpEncoded32[0] + 1;
        expect(() => { winternitz.decodeBuffer32(tmpEncoded32, 0); }).toThrow('Invalid key');
    });

    it(`Decode: change checksum - buffer32 data was not decoded and error was thrown`, () => {
        encoded32 = winternitz.encodeBuffer32(dataToEncode32, 0);
        const tmpEncoded32 = hashSubKey(encoded32, hashSize * 86);
        expect(() => { winternitz.decodeBuffer32(tmpEncoded32, 0); }).toThrow('Invalid checksum');
    });

});


