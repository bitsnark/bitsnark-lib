import { isFileExists, deleteDir, getFileSizeBytes } from "../../src/encoder-decoder/files-utils";
import { Lamport } from "../../src/encoder-decoder/lamport";

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
function getDataBitToEncode(data: Buffer, index: number): number {
    // return the index bit value of the buffer. the first bit in a byte is the LSB.
    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    return (data[byteIndex] >> bitIndex) & 1;
}


describe(`Test sequence for Lamport signature`, () => {
    const folder = `lamport`;

    beforeAll(() => {
        deleteDir(folder);
    });

    const lamportHandler = new Lamport(folder);

    it('Create Lamport class instance', () => {
        expect(lamportHandler).toBeInstanceOf(Lamport);
    });

    let keyMerkleRoot: Buffer;
    it('Generate keys - returning public & private keys location & equivocationMerkleRoot', () => {
        //const equivocationTapRoot = 
        lamportHandler.generateKeys(dataBuffer.length * unitsInOneByte);
        //expect(equivocationTapRoot).toBeDefined();
        //keyMerkleRoot = equivocationTapRoot;
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

    // it(`Validate merkle root`, () => {
    //     expect(lamportHandler.validateMerkleRoot(keyMerkleRoot)).toBe(true);
    // });

    it('Throw an error on a second attempt to generate keys for the same folder', () => {
        expect(() => { lamportHandler.generateKeys(dataBuffer.length); }).toThrow();
    });

    const dataToEncode = getDataBufferToEncode(dataBuffer, 1, 2);

    let encoded: Buffer;
    it('Encode: recive 2 bytes of data, return 2 * 32 * 8 (hash * unitsInOneByte) = 512 encoded', () => {
        encoded = lamportHandler.encodeBuffer(dataToEncode, 8);
        expect(encoded.length).toBe(2 * hashSize * unitsInOneByte);
    });

    let decoded: any;

    it(`Decode: data was decoded`, () => {
        decoded = lamportHandler.decodeBuffer(encoded, 8, keyMerkleRoot);
        expect(decoded.success === 'success');
        expect(Buffer.from(decoded.data).compare(dataToEncode)).toBe(0);
    });

    it(`Check that a cache file was added ${folder}`, () => {
        expect(isFileExists(folder, CACHE_FILE)).toBe(true);
    });

    it(`Size of ${dataBuffer.length * unitsInOneByte * hashSize}`, () => {
        expect(getFileSizeBytes(folder, CACHE_FILE)).toBe(dataBuffer.length * unitsInOneByte * hashSize);
    });


    it('Encode: one bit 3', () => {
        encoded = lamportHandler.encodeBit(getDataBitToEncode(dataBuffer, 3), 3);
        expect(encoded.length).toBe(hashSize);
    });


    it(`Decode: bit was decoded`, () => {
        decoded = lamportHandler.decodeBuffer(encoded, 3, keyMerkleRoot);
        expect(decoded.success === 'success');
        expect(decoded.data.length).toBe(1);
        expect(parseInt(decoded.data[0])).toBe(getDataBitToEncode(dataBuffer, 3));
    });

    it('Decode: if CONFLICT return equivocationMerkleRoot, prvkey1, prvkey2', () => {
        dataBuffer[1] = 0x12; //change in bit no 8 - create conflict
        const tmp = lamportHandler.encodeBuffer(getDataBufferToEncode(dataBuffer, 1, 2), 8);
        decoded = lamportHandler.decodeBuffer(tmp, 8, keyMerkleRoot);
        expect(decoded.success === 'conflict');
        expect(decoded.prv1.length).toBe(hashSize);
        expect(decoded.prv2.length).toBe(hashSize);
        expect(decoded.prv1.compare(decoded.prv2) === 0).toBe(false);

    });

    it('Decode: if both CONFLICT & UNDECODED return equivocationMerkleRoot, prvkey1, prvkey2', () => {
        dataBuffer[1] = 0x12; //change in bit no 8 - create conflict
        const tmp = lamportHandler.encodeBuffer(getDataBufferToEncode(dataBuffer, 0, 2), 0);
        tmp[0] = tmp[0] + 1; // chenge encode v- create undeocable
        decoded = lamportHandler.decodeBuffer(tmp, 0, keyMerkleRoot);
        expect(decoded.success === 'conflict');
        expect(decoded.prv1.length).toBe(hashSize);
        expect(decoded.prv2.length).toBe(hashSize);
        expect(decoded.prv1.compare(decoded.prv2) === 0).toBe(false);
    });


});


