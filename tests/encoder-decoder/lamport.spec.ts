import { createHash } from "node:crypto";
import { Codec } from "../../src/encoder-decoder/codec";
import { CodecType, DecodeData, DecodeError, Decodeconflict } from "../../src/encoder-decoder/codec-provider";
import { isFileExists, deleteDir, getFileSizeBytes, readFromFile } from "../../src/encoder-decoder/files-utils";

const dataBuffer = Buffer.from([0x01, 0x13, 0x14, 0x05]);

const PRV_KEY_FILE = "prv.bin";
const PUB_KEY_FILE = "pub.bin";
const CACHE_FILE = "cache.bin";

const hashSize = 32;
const valuesPerUnit = 2;
const unitsInOneByte = 8;

function getDataBufferToEncode(data: Buffer, byteIndex: number, length: number): Buffer {
    return Buffer.from(data.subarray(byteIndex, byteIndex + length));
}
function getDataBitToEncode(data: Buffer, index: number): 0 | 1 {
    // return the index bit value of the buffer. the first bit in a byte is the LSB.
    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    return ((data[byteIndex] >> bitIndex) & 1) as 0 | 1;
}


describe(`Test sequence for Lamport signature`, () => {
    const folder = `lamport`;

    beforeAll(() => {
        deleteDir(folder);
    });

    const lamportCodec = new Codec(folder, CodecType.lamport)

    it('Create Codec class instance - CodecType.lamport', () => {
        expect(lamportCodec).toBeInstanceOf(Codec);
    });

    it('Generate keys - returning public & private keys location & equivocationMerkleRoot', () => {
        const taproot = lamportCodec.generateKeys(dataBuffer.length * unitsInOneByte);
        expect(Buffer.from(taproot).length).toBe(34);
    });

    it(`Check that a public key file was added to ${folder}`, () => {
        expect(isFileExists(folder, PUB_KEY_FILE)).toBe(true);
    });

    it(`Size of ${dataBuffer.length * unitsInOneByte * hashSize * valuesPerUnit}`, () => {
        expect(getFileSizeBytes(folder, PUB_KEY_FILE)).toBe(dataBuffer.length * unitsInOneByte * hashSize * valuesPerUnit);
    });

    it(`Check that a private key file was added to ${folder}`, () => {
        expect(isFileExists(folder, PRV_KEY_FILE)).toBe(true);
    });

    it(`Size of ${dataBuffer.length * unitsInOneByte * hashSize * valuesPerUnit}`, () => {
        expect(getFileSizeBytes(folder, PRV_KEY_FILE)).toBe(dataBuffer.length * unitsInOneByte * hashSize * valuesPerUnit);
    });



    it(`Returns the public key after hashing the private key once (check first key part)`, () => {
        const prv = readFromFile(folder, PRV_KEY_FILE, 0, 32);
        const pub = readFromFile(folder, PUB_KEY_FILE, 0, 32);

        expect(createHash('sha256').update(prv).digest().compare(pub)).toBe(0);
    });


    it('Throw an error on a second attempt to generate keys for the same folder', () => {
        expect(() => { lamportCodec.generateKeys(dataBuffer.length * 8); }).toThrow();
    });

    const dataToEncode = getDataBufferToEncode(dataBuffer, 1, 2);

    let encoded: Buffer;
    it('Encode: receive 2 bytes of data, return 2 * 32 * 8 (hash * unitsInOneByte) = 512 encoded', () => {
        encoded = lamportCodec.encodeBuffer(dataToEncode, 8);
        expect(encoded.length).toBe(2 * hashSize * unitsInOneByte);
    });

    let decoded: DecodeData | DecodeError | Decodeconflict;
    it(`Decode: data was decoded`, () => {
        decoded = lamportCodec.decodeBuffer(encoded, 8);
        expect(decoded).toBeDefined();
        expect('data' in decoded).toBe(true);
        expect('data' in decoded && Buffer.from(decoded.data || '').compare(dataToEncode)).toBe(0)
    });

    it(`Check that a cache file was added ${folder}`, () => {
        expect(isFileExists(folder, CACHE_FILE)).toBe(true);
    });

    it(`Size of ${dataBuffer.length * unitsInOneByte * hashSize}`, () => {
        expect(getFileSizeBytes(folder, CACHE_FILE)).toBe(dataBuffer.length * unitsInOneByte * hashSize);
    });


    it('Encode: one bit 3', () => {
        encoded = lamportCodec.encodeBit(getDataBitToEncode(dataBuffer, 3), 3);
        expect(encoded.length).toBe(hashSize);
    });


    it(`Decode: bit was decoded`, () => {
        decoded = lamportCodec.decodeBuffer(encoded, 3);
        expect(decoded).toBeDefined();
        expect('data' in decoded).toBe(true);
        if ('data' in decoded) {
            expect(decoded.data.length).toBe(1);
            expect((decoded.data[0])).toBe(getDataBitToEncode(dataBuffer, 3));
        }
    });

    it('Decode: if CONFLICT return equivocationMerkleRoot, prvkey1, prvkey2', () => {
        dataBuffer[1] = 0x12; //change in bit no 8 - create conflict
        const tmp = lamportCodec.encodeBuffer(getDataBufferToEncode(dataBuffer, 1, 2), 8);
        decoded = lamportCodec.decodeBuffer(tmp, 8);
        expect(decoded).toBeDefined();
        expect('prv1' in decoded).toBe(true);
        expect('prv2' in decoded).toBe(true);
        expect('index' in decoded).toBe(true);
        expect('script' in decoded).toBe(true);
        if ('prv1' in decoded && 'prv2' in decoded) {
            expect(decoded.prv2 && decoded.prv1?.compare(decoded.prv2) === 0).toBe(false);
        }

    });
});


