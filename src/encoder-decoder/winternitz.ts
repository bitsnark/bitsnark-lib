import { createHash } from "node:crypto";
import { readFromFile, getFileSizeBytes, writeToPosInFile } from "./files-utils";
import { PRV_KEY_FILE, PUB_KEY_FILE, CACHE_FILE } from "./files-utils";
import { CodecProvider, CodecType, DecodeData, DecodeError, Decodeconflict } from "./codec-provider";
import { bufferTo3BitArray, arrayToBuffer } from "./utils"
import { Bitcoin } from "../generator/step3/bitcoin";
import { bufferToBigints256BE } from "../encoding/encoding";
import { error } from "node:console";

export const FILE_PREFIX_32 = "winternitz-32-";
export const FILE_PREFIX_4 = "winternitz-4-";

const FILE_32_PREFIX = "winternitz-32-";
const FILE_256_PREFIX = "winternitz-256-";

const nibbleSizeInBits = 3;
const valuesPerUnit = 2 ** nibbleSizeInBits;
const prvToPubHashCount = 2 ** nibbleSizeInBits;
const hashSize: number = 32;
const chunkSize32 = 32;
const chunkSize4 = 4;
const checksum4BytesSize = 3;
const checksum32BytesSize = 4;
const hashsInUnit256 = 90;
const hashsInUnit32 = 14;
export class Winternitz extends CodecProvider {
    private chunkSizeInBytes: number;
    private checksumSizeInUnits: number;
    private totalNibblesInChunk: number;
    private dataNibblesInChunk: number;

    constructor(folder: string, codecType: CodecType) {

        //this.codecType = codecType;
        if (codecType === CodecType.winternitz32) {
            super(folder,
                codecType,
                valuesPerUnit,
                prvToPubHashCount,
                hashsInUnit32,
                Buffer.from('55adf4e8967fbd2e29f20ac896e60c3b0f1d5b0efa9d34941b5958c7b0a0312d', 'hex'),
                FILE_32_PREFIX.concat(PRV_KEY_FILE),
                FILE_32_PREFIX.concat(PUB_KEY_FILE),
                FILE_32_PREFIX.concat(CACHE_FILE));

            this.checksumSizeInUnits = checksum4BytesSize;
            this.chunkSizeInBytes = chunkSize4;
            this.dataNibblesInChunk = 11;
            this.totalNibblesInChunk = 14;

        }
        else if (codecType === CodecType.winternitz256) {
            super(folder,
                codecType,
                valuesPerUnit,
                prvToPubHashCount,
                hashsInUnit256,
                Buffer.from('55adf4e8967fbd2e29f20ac896e60c3b0f1d5b0efa9d34941b5958c7b0a0312d', 'hex'),
                FILE_256_PREFIX.concat(PRV_KEY_FILE),
                FILE_256_PREFIX.concat(PUB_KEY_FILE),
                FILE_256_PREFIX.concat(CACHE_FILE));

            this.checksumSizeInUnits = checksum32BytesSize;
            this.chunkSizeInBytes = chunkSize32;
            this.dataNibblesInChunk = 86;
            this.totalNibblesInChunk = 90;
        }
        else {
            throw Error(`Unknon codec ${codecType}`)
        }
        this.folder = folder;
    }



    public computeKeySetsCount(sizeInEncodeUnits: number): number {
        return sizeInEncodeUnits * Math.ceil(this.chunkSizeInBytes * 8 / nibbleSizeInBits) + sizeInEncodeUnits * this.checksumSizeInUnits;
    }

    public getKeySetsStartPosByUnitIndex(unitIndex: number): number {
        return unitIndex * this.totalNibblesInChunk * hashSize;
    }

    public getKeySetsLengthByDataSize(dataSizeInBytes: number, isDataEncoded?: boolean): number {
        return this.totalNibblesInChunk * hashSize;
    }

    public getCacheSectionStart(unitIndex: number): number {
        return unitIndex * this.totalNibblesInChunk * hashSize;
    }

    public getCacheSectionLength(encodedSizeInBytes: number): number {
        return this.totalNibblesInChunk * hashSize;
    }

    public calculateCacheSize(): number {
        return getFileSizeBytes(this.folder, this.pubKeyFileName);
    }

    public getUnitCount() {
        return getFileSizeBytes(this.folder, this.pubKeyFileName) / (this.totalNibblesInChunk * hashSize);
    }

    public encodeBit(b: number, indexInBits: number): never {
        throw error(`Codec ${this.codecType} does not support encodeBit`)
    }

    public encodeBuffer(buffer: Buffer, prvKeyBuffer: Buffer) {
        const nibbleArray = bufferTo3BitArray(buffer);
        const result = Buffer.alloc(prvKeyBuffer.length);

        const checksum = nibbleArray.reduce((sum, nibble, i) => {
            const nibbleKey = this.encodeNibble(prvKeyBuffer, i, 7 - nibble);
            nibbleKey.copy(result, i * hashSize, 0, hashSize);
            return sum + nibble;
        }, 0);

        const checksumBuffer = this.checksumToBuffer(checksum);
        const checksumArray = bufferTo3BitArray(checksumBuffer);

        checksumArray.forEach((iChecksumValue, index) => {
            const i = nibbleArray.length + index;
            const nibbleKey = this.encodeNibble(prvKeyBuffer, i, iChecksumValue);
            nibbleKey.copy(result, i * hashSize, 0, hashSize);
        });

        return result;
    }

    private encodeNibble(keyBuffer: Buffer, i: number, times: number) {
        let nibbleKey = keyBuffer.subarray(i * hashSize, (i + 1) * hashSize);
        for (let e = 0; e < times; e++) {
            nibbleKey = createHash('sha256').update(nibbleKey).digest();
        }
        return nibbleKey;
    }


    private checksumToBuffer(checksum: number) {
        const checksumBuffer = Buffer.alloc(2);
        checksumBuffer.writeUInt16LE(checksum);
        return checksumBuffer;
    }

    private checksumToNibbleArray(checksum: number, checksumSize: number) {
        const checksumBuffer = this.checksumToBuffer(checksum)
        return bufferTo3BitArray(checksumBuffer).slice(0, checksumSize);
    }

    private validateDecoded(length: number, encoded: Buffer, pubKeySets: Buffer): number[] {
        const nibbleArray = Array.from({ length: (this.dataNibblesInChunk) }, (_, i) => {
            const iPubKey = pubKeySets.subarray(i * hashSize, (i + 1) * hashSize);
            return this.decodeDataNibble(encoded, i, iPubKey);
        });

        const checksum = nibbleArray.reduce((sum, current) => sum + current, 0);
        const checksumArray = this.checksumToNibbleArray(checksum, this.checksumSizeInUnits);

        checksumArray.forEach((checksumValue, index) => {
            const i = this.dataNibblesInChunk + index;
            const iChecksumEncoded = this.encodeNibble(encoded, i, 8 - checksumValue);
            const ichecksumKey = pubKeySets.subarray(i * hashSize, (i + 1) * hashSize);
            if (iChecksumEncoded.compare(ichecksumKey) !== 0) throw new Error(`Invalid checksum`);
        });

        return nibbleArray;
    }

    public decodePrvByPub(encoded: Buffer, pubKeySets: Buffer): DecodeData | DecodeError {
        const chuncksEncoded = encoded.length / this.getKeySetsLengthByDataSize(1);

        const result = Buffer.alloc(this.chunkSizeInBytes * chuncksEncoded);

        for (let i = 0; i < chuncksEncoded; i++) {
            const eChunk = encoded.subarray(i * this.getKeySetsLengthByDataSize(1), (i + 1) * this.getKeySetsLengthByDataSize(1))
            const nibbleArray = this.validateDecoded(this.dataNibblesInChunk, eChunk, pubKeySets);
            result.set(arrayToBuffer(nibbleArray, this.chunkSizeInBytes), i * this.chunkSizeInBytes);
        }

        return this.returnDecodedSuccess(result);
    }

    public decodeBuffer(encoded: Buffer, indexInUnits: number, pubKeySets: Buffer, cache: Buffer): DecodeData | DecodeError | Decodeconflict {
        const nibbleArray = this.validateDecoded(this.dataNibblesInChunk, encoded, pubKeySets);

        if (this.isEmpty(cache)) {
            writeToPosInFile(this.folder,
                this.cacheFileName,
                encoded,
                indexInUnits * this.totalNibblesInChunk * hashSize);


        } else if (cache.compare(encoded) !== 0) {
            return this.returnDecodedConflict(cache, encoded, indexInUnits)
        }

        return this.returnDecodedSuccess(arrayToBuffer(nibbleArray, this.chunkSizeInBytes));
    }

    private decodeDataNibble(keyBuffer: Buffer, i: number, comperTo: Buffer) {
        let nibbleKey = keyBuffer.subarray(i * hashSize, (i + 1) * hashSize);

        for (let e = 0; e < 8; e++) {
            nibbleKey = createHash('sha256').update(nibbleKey).digest();
            if (nibbleKey.compare(comperTo) === 0) {
                return e;
            }
        }
        throw new Error(`Invalid key nibble ${i} key ${nibbleKey}`);
    }


    public generateEquivocationScript(bitcoin: Bitcoin, unitIndex: number) {
        const decodedItems = [];
        const pubKey = readFromFile(
            this.folder,
            this.pubKeyFileName,
            this.getKeySetsStartPosByUnitIndex(unitIndex),
            this.getKeySetsLengthByDataSize(0));

        const kArr: bigint[] = [];
        for (let i = 0; i < this.hashsInUnit; i++) {
            kArr.push(bufferToBigints256BE(pubKey.subarray(i * hashSize, i * hashSize + hashSize))[0]);
        }

        const wArr = Array.from({ length: this.hashsInUnit }, () => bitcoin.addWitness(0n));
        for (let i = 0; i < this.hashsInUnit; i++) decodedItems.push(bitcoin.newStackItem(0n));
        if (this.codecType === CodecType.winternitz32)
            bitcoin.winternitzEquivocation32(decodedItems, wArr, wArr, kArr);
        else if (this.codecType === CodecType.winternitz256)
            bitcoin.winternitzEquivocation256(decodedItems, wArr, wArr, kArr);
    }


}


