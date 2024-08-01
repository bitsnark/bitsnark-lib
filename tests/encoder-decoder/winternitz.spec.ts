import { createHash } from "crypto";
import { isFileExists, deleteDir, getFileSizeBytes } from "../../src/encoder-decoder/files-utils";
import { Winternitz } from "../../src/encoder-decoder/winternitz";
import { Codec } from "../../src/encoder-decoder/codec";
import { eCodecType } from "../../src/encoder-decoder/codec-provider";

const dataBuffer256 = Buffer.from([
    0xe2, 0x9d, 0xc3, 0x72, 0x89, 0x5d, 0x18, 0x5d,
    0xa9, 0x1a, 0x8b, 0x68, 0x5f, 0xe9, 0xf3, 0x27,
    0x91, 0xc5, 0x0e, 0xe3, 0x3d, 0x93, 0x8a, 0x1b,
    0x11, 0x0b, 0xf4, 0x73, 0x7a, 0x63, 0x6b, 0xb7,
    0xe5, 0x9d, 0xc3, 0x72, 0x89, 0x5d, 0x18, 0x5d,
    0x29, 0x1a, 0x8b, 0x68, 0x55, 0xe9, 0xf5, 0x27,
    0xe1, 0xc5, 0x08, 0xe3, 0x3d, 0x93, 0x8a, 0x1b,
    0x11, 0x0b, 0xf4, 0x73, 0x7a, 0x63, 0x6b, 0xb7
]);


const dataBuffer32 = Buffer.from([
    0x00, 0x45, 0xfc, 0xff, 0xff, 0x00,
    0x4e, 0x0f, 0xbb, 0x61, 0x84, 0x7d
]);


const PRV_KEY_FILE = "prv.bin";
const PUB_KEY_FILE = "pub.bin";
export const FILE_PREFIX_256 = "winternitz-256-";
export const FILE_PREFIX_32 = "winternitz-32-";
const chunckSize256 = 32;
const chunckSize32 = 4;
const hashSize = 32;


const totalChuncks256 = dataBuffer256.length / chunckSize256;
const totalChuncks32 = dataBuffer32.length / chunckSize32;


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
    const folder256 = `winternitz-256`;
    const folder32 = `winternitz-32`;

    beforeAll(() => {
        deleteDir(folder256);
        deleteDir(folder32);
    });

    const winternitz256 = new Codec(folder256, eCodecType.winternitz256)
    const winternitz32 = new Codec(folder32, eCodecType.winternitz32)


    it('Create Winternitz classes instance', () => {
        expect(winternitz32).toBeInstanceOf(Codec);
        expect(winternitz256).toBeInstanceOf(Codec);
    });

    it('Generate keys - returning taproot ', () => {
        console.log('totalChuncks256', totalChuncks256, 'totalChuncks32', totalChuncks32);
        const taproot256 = winternitz256.generateKeys(totalChuncks256);
        const taproots32 = winternitz32.generateKeys(totalChuncks32);
        expect(taproot256.length).toBe(34);
        expect(taproots32.length).toBe(34);
    });

    it(`Check that a 2 file was added to ${folder32}`, () => {
        expect(isFileExists(folder32, `${FILE_PREFIX_32}${PRV_KEY_FILE}`)).toBe(true);
        expect(isFileExists(folder32, `${FILE_PREFIX_32}${PUB_KEY_FILE}`)).toBe(true);
    });

    it(`Check that a 2 file was added to ${folder256}`, () => {
        expect(isFileExists(folder256, `${FILE_PREFIX_256}${PRV_KEY_FILE}`)).toBe(true);
        expect(isFileExists(folder256, `${FILE_PREFIX_256}${PUB_KEY_FILE}`)).toBe(true);
    });


    it(`Size of all four 32bits data files is correct`, () => {
        expect(getFileSizeBytes(folder32, `${FILE_PREFIX_32}${PRV_KEY_FILE}`)).toBe(totalChuncks32 * 14 * hashSize);
        expect(getFileSizeBytes(folder32, `${FILE_PREFIX_32}${PUB_KEY_FILE}`)).toBe(totalChuncks32 * 14 * hashSize);
    });

    it(`Size of all four 256bits data files is correct`, () => {
        expect(getFileSizeBytes(folder256, `${FILE_PREFIX_256}${PRV_KEY_FILE}`)).toBe(totalChuncks256 * 90 * hashSize);
        expect(getFileSizeBytes(folder256, `${FILE_PREFIX_256}${PUB_KEY_FILE}`)).toBe(totalChuncks256 * 90 * hashSize);
    });

    it('Throw an error on a second attempt to generate keys for the same folders', () => {
        expect(() => { winternitz256.generateKeys(dataBuffer256.length); }).toThrow();
        expect(() => { winternitz32.generateKeys(dataBuffer32.length); }).toThrow();
    });

    const dataToEncode32 = getDataBufferToEncode(dataBuffer32, 0, 4);
    let encoded32: Buffer;
    it('Encode: recive 32 bits of data, return (3 + 11) * 32 (hash * ( nibbles in chunckSize4 + 2checksum)) = 448 encoded', () => {
        encoded32 = winternitz32.encodeBuffer(dataToEncode32, 0);
        expect(encoded32.length).toBe(hashSize * (3 + 11));
    });

    let decoded32;
    it(`Decode: buffer 32bit data was decoded`, () => {
        decoded32 = winternitz32.decodeBuffer(encoded32, 0);
        expect(decoded32.type === 'success');
        expect(Buffer.from(decoded32.data || '').compare(dataToEncode32.subarray(0, chunckSize32))).toBe(0);
    });

    it(`Decode: change hash - buffer 32bit data was not decoded and error was thrown`, () => {
        const tmpEncoded32 = encoded32;
        tmpEncoded32[0] = tmpEncoded32[0] + 1;
        expect(() => { winternitz32.decodeBuffer(tmpEncoded32, 0); }).toThrow('Invalid key');
    });

    it(`Decode: change checksum - buffer 32bit data was not decoded and error was thrown`, () => {
        encoded32 = winternitz32.encodeBuffer(dataToEncode32, 0);
        const tmpEncoded32 = hashSubKey(encoded32, hashSize * 11);
        expect(() => { winternitz32.decodeBuffer(tmpEncoded32, 0); }).toThrow('Invalid checksum');
    });

    it(`Decode: same block data buffer 32bit if just like cache`, () => {
        decoded32 = winternitz32.decodeBuffer(encoded32, 0);
        expect(Buffer.from(decoded32.data || '').compare(dataToEncode32.subarray(0, chunckSize32))).toBe(0);
    });

    it(`Decode: new block data buffer 32bit (2) is decoded ok`, () => {
        const tmpEncoded32 = winternitz32.encodeBuffer(getDataBufferToEncode(dataBuffer32, 8, 4), 2);
        const tmpDecoded32 = winternitz32.decodeBuffer(tmpEncoded32, 2);
        expect(Buffer.from(tmpDecoded32.data || '').compare(getDataBufferToEncode(dataBuffer32, 8, 4))).toBe(0);

    });

    it(`Decode throws cache error if same block data buffer has different cache`, () => {
        const tmpEncoded32 = winternitz32.encodeBuffer(Buffer.from([0x3b, 0x61, 0x84, 0x71]), 2);
        const tmpDecoded32 = winternitz32.decodeBuffer(tmpEncoded32, 2);
        expect(tmpDecoded32.type === 'conflict');
        console.log('decoded conflict', tmpEncoded32)

    });


    const dataToEncode256 = getDataBufferToEncode(dataBuffer256, 0, 32);
    let encoded256: Buffer;
    it('Encode: recive 32 bytes of data, return (4 + 86) * 32 (hash * (nibbles in chunckSize32 + 2checksum) = 2880 encoded', () => {
        encoded256 = winternitz256.encodeBuffer(dataToEncode256, 0);
        expect(encoded256.length).toBe(hashSize * (4 + 86));
    });


    let decoded256;
    it(`Decode: buffer 256 bit data was decoded`, () => {
        decoded256 = winternitz256.decodeBuffer(encoded256, 0);
        expect(decoded256.type === 'success');
        expect(Buffer.from(decoded256.data || '').compare(dataToEncode256.subarray(0, chunckSize256))).toBe(0);
    });



    it(`Decode: change hash - buffer 256 bit data was not decoded and error was thrown`, () => {
        const tmpEncoded256 = encoded256;
        tmpEncoded256[0] = tmpEncoded256[0] + 1;
        expect(() => { winternitz256.decodeBuffer(tmpEncoded256, 0); }).toThrow('Invalid key');
    });

    it(`Decode: change checksum - buffer 256 bit data was not decoded and error was thrown`, () => {
        encoded256 = winternitz256.encodeBuffer(dataToEncode256, 0);
        const tmpEncoded256 = hashSubKey(encoded256, hashSize * 86);
        expect(() => { winternitz256.decodeBuffer(tmpEncoded256, 0); }).toThrow('Invalid checksum');
    });

    it(`Decode: new block data buffer 256 bit (2) is decoded ok`, () => {
        const tmpEncoded256 = winternitz256.encodeBuffer(getDataBufferToEncode(dataBuffer256, 32, 32), 1);
        const tmpDecoded256 = winternitz256.decodeBuffer(tmpEncoded256, 1);
        expect(Buffer.from(tmpDecoded256.data || '').compare(getDataBufferToEncode(dataBuffer256, 32, 32))).toBe(0);

    });

    it(`Decode throws cache error if same block data buffer has different cache`, () => {
        const tmpEncoded256 = winternitz256.encodeBuffer(Buffer.from(
            [0xe5, 0x9d, 0xc4, 0x72, 0x89, 0x5d, 0x18, 0x5d,
                0x29, 0x1a, 0x8b, 0x68, 0x55, 0xe9, 0xf5, 0x27,
                0xe1, 0xc5, 0x08, 0xe3, 0x3d, 0x93, 0x8a, 0x1b,
                0x11, 0x0b, 0xf4, 0x73, 0x7a, 0x63, 0x6b, 0xb7]), 1);
        const tmpDecoded256 = winternitz256.decodeBuffer(tmpEncoded256, 1);
        expect(tmpDecoded256.type === 'conflict');
        console.log('decoded conflict', tmpDecoded256)

    });
});


