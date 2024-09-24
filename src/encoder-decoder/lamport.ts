import { createHash } from "node:crypto";
import { readFromFile, getFileSizeBytes, writeToPosInFile } from "./files-utils";
import { PRV_KEY_FILE, PUB_KEY_FILE, CACHE_FILE } from "./files-utils";
import { Bitcoin } from "../generator/step3/bitcoin";
import { bufferToBigints256BE } from "../encoding/encoding";
import { CodecProvider, CodecType, DecodeData, DecodeError, Decodeconflict } from "./codec-provider";

const hashSize: number = 32;
const valuesPerUnit = 2;
const unitsInOneByte = 8;
const bitsInByte = 8;
const prvToPubHashCount = 1;
const hashsInUnit = 1
export const FILE_PREFIX = "lamport-";
export class Lamport extends CodecProvider {



    constructor(folder: string, codecType: CodecType) {
        super(folder,
            codecType,
            valuesPerUnit,
            prvToPubHashCount,
            hashsInUnit,
            Buffer.from('55adf4e8967fbd2e29f20ac896e60c3b0f1d5b0efa9d34941b5958c7b0a0312d', 'hex'),
            PRV_KEY_FILE,
            PUB_KEY_FILE,
            CACHE_FILE);
    }

    public computeKeySetsCount(sizeInEncodeUnits: number): number {
        return sizeInEncodeUnits * valuesPerUnit;
    }

    public getKeySetsStartPosByUnitIndex(unitIndex: number): number {
        return unitIndex * valuesPerUnit * hashSize;
    }

    public getKeySetsLengthByDataSize(dataSizeInBytes: number, isDataEncoded: boolean = false): number {
        if (isDataEncoded) return dataSizeInBytes * valuesPerUnit;
        return dataSizeInBytes * unitsInOneByte * hashSize * valuesPerUnit;
    }

    public getCacheSectionStart(unitIndex: number): number {
        return unitIndex * hashSize;
    }

    public getCacheSectionLength(encodedSizeInBytes: number): number {
        return encodedSizeInBytes;
    }

    public calculateCacheSize() {
        const keySize = getFileSizeBytes(this.folder, PUB_KEY_FILE);
        return keySize / valuesPerUnit;
    }

    public getUnitCount() {
        return getFileSizeBytes(this.folder, this.pubKeyFileName) / (valuesPerUnit * hashSize);
    }

    public encodeBit(b: number, indexInBits: number): Buffer {
        const prvKeyBuffer = readFromFile(
            this.folder,
            PRV_KEY_FILE,
            indexInBits * valuesPerUnit * hashSize,
            hashSize * valuesPerUnit);

        const result = Buffer.alloc(hashSize);
        prvKeyBuffer.copy(result, 0, b * hashSize, (b + 1) * hashSize);
        return result;
    }

    public encodeBuffer(buffer: Buffer, prvKeyBuffer: Buffer): Buffer {
        const result = Buffer.alloc(buffer.length * unitsInOneByte * hashSize);

        for (let i = 0; i < buffer.length; i++) {

            for (let j = 0; j < bitsInByte; j++) {
                const b = (buffer[i] >> j) & 1;

                prvKeyBuffer.copy(result,
                    (i * unitsInOneByte + j) * hashSize,
                    (i * unitsInOneByte + j) * hashSize * valuesPerUnit + b * hashSize,
                    (i * unitsInOneByte + j) * hashSize * valuesPerUnit + b * hashSize + hashSize);
            }
        }
        return result;
    }

    public decodePrvByPub(encoded: Buffer, pubKeySets: Buffer): DecodeData | DecodeError {
        // We actually want to ignore an possible error.
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        return this.decodeBufferWithOptions(encoded, pubKeySets, false);
    }



    public decodeBuffer(encoded: Buffer, unitIndex: number, pubKey: Buffer, cache: Buffer): DecodeData | DecodeError | Decodeconflict {
        return this.decodeBufferWithOptions(encoded, pubKey, true, cache, unitIndex);
    }

    private decodeBufferWithOptions(encoded: Buffer, pubKey: Buffer, useCache: boolean, cache?: Buffer, unitIndex?: number): DecodeData | DecodeError | Decodeconflict {
        let resultData = Buffer.alloc(encoded.length / (hashSize * unitsInOneByte));

        let byteValue = 0;
        let decodeError = '';

        for (let i = 0; i < encoded.length / hashSize; i++) {
            const { iEncoded, iPubKey } = this.getSubArrays(i, encoded, pubKey);

            const iHash = createHash('sha256').update(iEncoded).digest();
            const iHashIndex = iPubKey.indexOf(iHash);

            if (!this.isValidHashIndex(iHashIndex)) {
                decodeError +=
                    `Invalid encoded data ${iEncoded.toString('hex')} ==> \n hash: ${iHash.toString('hex')} is not a public key`;
                byteValue = 0;
                continue;
            }

            byteValue = this.accamulateByte(byteValue, iHashIndex, i);
            if ((i) % bitsInByte === 7) {
                resultData[Math.floor(i / bitsInByte)] = byteValue;
                byteValue = 0;
            }

            if (useCache) {
                if (!cache) throw new Error('Cache is not provided');
                if (!unitIndex) throw new Error('Unit index is not provided');

                const iCache = cache.subarray(i * hashSize, (i + 1) * hashSize);

                if (this.isConflict(iCache, iEncoded)) {
                    return this.returnDecodedConflict(iCache, iEncoded, unitIndex + i);
                }

                this.writeBufferToCachedFile(unitIndex + i, iEncoded);
            }
        }

        if (decodeError) return this.returnDecodedError(decodeError)
        if (encoded.length === hashSize) resultData = Buffer.from([byteValue]);
        return this.returnDecodedSuccess(resultData);
    }

    private getSubArrays(i: number, encoded: Buffer, pubKey: Buffer) {
        const iEncoded = encoded.subarray(i * hashSize, (i + 1) * hashSize);
        const iPubKey = pubKey.subarray(i * hashSize * valuesPerUnit, (i + 1) * hashSize * valuesPerUnit);
        return { iEncoded, iPubKey };
    }

    private isValidHashIndex(index: number) {
        return index !== -1 && (index / hashSize === 0 || index / hashSize === 1);
    }

    private accamulateByte(byteValue: number, iHashIndex: number, i: number) {
        return byteValue | ((iHashIndex / hashSize) << (i % bitsInByte));
    }

    private writeBufferToCachedFile(hashIndex: number, encoded: Buffer) {
        writeToPosInFile(this.folder, CACHE_FILE, encoded, hashIndex * hashSize);
    }

    public generateEquivocationScript(bitcoin: Bitcoin, unitIndex: number) {
        const pubKey = readFromFile(this.folder,
            this.pubKeyFileName,
            this.getKeySetsStartPosByUnitIndex(unitIndex),
            valuesPerUnit * hashSize);

        const k0 = bufferToBigints256BE(Buffer.from(pubKey.subarray(0, hashSize)))[0];
        const k1 = bufferToBigints256BE(Buffer.from(pubKey.subarray(hashSize)))[0];
        const w0 = bitcoin.addWitness(0n);
        const w1 = bitcoin.addWitness(0n);
        bitcoin.lamportEquivocation([w0, w1], [k0, k1]);
    }
} 
