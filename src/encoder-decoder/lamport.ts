import { createHash, randomBytes } from "node:crypto";
import { createFolder, readFromFile, isFileExists, getFileSizeBytes, writeToPosInFile, writeToFile, deleteDir, readTextFile, writeTextToFile } from "./files-utils";
import { PRV_KEY_FILE, PUB_KEY_FILE, CACHE_FILE } from "./files-utils";
import { makeLamportEquivocationTaproot } from "../generator/taproot/lamport-equivocation";
import internal from "node:stream";

const internalPblicKey = 'd6889cb081036e0faefa3a35157ad71086b123b2b144b649798b494c300a961d';


export const FILE_PREFIX = "lamport-";

const hashSize: number = 32;
const valuesPerUnit = 2;
const unitsInOneByte = 8;
const bitsInByte = 8;

export interface iDecoded {
    isDecoded: boolean;
    unitIndex: number;
    claim: Buffer;
    claimDataBitValue: number;
}

export interface iData {
    data: Buffer;
    index: number; // in byte units
}

export interface iEncoded {
    encoded: Buffer;
    unitIndex: number;
    index: number; // in byte units
}

export interface iDecodedResult extends iDecoded {
    isConflict: boolean;
    cache: Buffer;
    //merkleProof: iMerkleProof | undefined;
}


export class Lamport {
    private folder: string;

    constructor(folder: string) {
        this.folder = folder;
    }

    public generateKeys(dataSizeInBits: number): Buffer | void {
        createFolder(this.folder, true);

        for (let i = 0; i < dataSizeInBits; i++) {
            const secretKeyBuffer = Buffer.alloc(valuesPerUnit * hashSize);
            const publicKeyBuffer = Buffer.alloc(valuesPerUnit * hashSize);

            for (let j = 0; j < valuesPerUnit; j++) {
                const prv = randomBytes(hashSize);
                const pub = createHash('sha256').update(prv).digest();
                prv.copy(secretKeyBuffer, j * hashSize);
                pub.copy(publicKeyBuffer, j * hashSize);
            }

            writeToFile(this.folder, PRV_KEY_FILE, secretKeyBuffer, 'a');
            writeToFile(this.folder, PUB_KEY_FILE, publicKeyBuffer, 'a');
        }

        //return makeLamportEquivocationTaproot(Buffer.from(internalPblicKey, 'hex'))
    }

    // public validateMerkleRoot(equivocationTaproot: Buffer, folder: string): boolean {
    //     const newMerkleRoot = makeLamportEquivocationTaproot(Buffer.from(internalPblicKey, 'hex'))
    //     return newMerkleRoot.compare(merkleRoot) === 0;
    // }

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

    public encodeBuffer(buffer: Buffer, indexInBits: number): Buffer {
        const prvKeyBuffer = readFromFile(
            this.folder,
            PRV_KEY_FILE,
            indexInBits * valuesPerUnit * hashSize,
            buffer.length * unitsInOneByte * hashSize * valuesPerUnit);

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

    public encodeBufferAddPublic(buffer: Buffer, indexInBits: number) {
        const pubKeyBuffer = readFromFile(
            this.folder,
            PUB_KEY_FILE,
            indexInBits * valuesPerUnit * hashSize,
            buffer.length * unitsInOneByte * hashSize * valuesPerUnit);
        return { pubk: pubKeyBuffer, encodedData: this.encodeBuffer(buffer, indexInBits) };
    }

    public decodeBuffer(encoded: Buffer, unitIndex: number, merkleRoot: Buffer) {
        this.insureCachFile();

        let byteValue = 0;
        let decodeError = '';
        const resultData = Buffer.alloc(encoded.length / (hashSize * unitsInOneByte));
        const resultConflict = { prv1: Buffer.alloc(0), prv2: Buffer.alloc(0), script: {} };

        const pubKey = this.readPublicKey(unitIndex, encoded.length);
        const cache = this.readCache(unitIndex, encoded.length);

        // const isEmpty = (buffer: Buffer) => buffer.every(byte => byte === 0);
        for (let i = 0; i < encoded.length / hashSize; i++) {
            const { iEncoded, iCache, iPubKey } = this.getSubArrays(i, encoded, cache, pubKey);

            const iHash = createHash('sha256').update(iEncoded).digest();
            const iHashIndex = iPubKey.indexOf(iHash);

            if (this.isValidHashIndex(iHashIndex)) {
                if (!this.isEmpty(iCache) && iCache.compare(iEncoded) !== 0) {
                    resultConflict.prv1 = Buffer.from(iCache);
                    resultConflict.prv2 = Buffer.from(iEncoded);
                    break;
                }
                else {
                    byteValue |= iHashIndex / hashSize << i % bitsInByte;
                    if ((i) % bitsInByte === 7) {
                        resultData[Math.floor(i / bitsInByte)] = byteValue;
                        byteValue = 0;
                    }
                    writeToPosInFile(this.folder, CACHE_FILE, iEncoded, (unitIndex + i) * hashSize);
                }
            } else {
                decodeError += `Invalid encoded data ${iEncoded.toString('hex')} ==> \n hash: ${iHash.toString('hex')} is not a public key of ${unitIndex + i} data bit. \n`;
                byteValue = 0;
            }
        }

        if (!this.isEmpty(resultConflict.prv1) || !this.isEmpty(resultConflict.prv2)) {
            return { type: 'conflict', conflict: resultConflict };
        }
        if (decodeError) {
            return { type: 'error', errorMessage: decodeError };
        }
        return { type: 'success', data: encoded.length === hashSize ? Buffer.from([byteValue]) : resultData };
    }

    private insureCachFile() {
        if (!isFileExists(this.folder, CACHE_FILE)) {
            const keySize = getFileSizeBytes(this.folder, PUB_KEY_FILE);
            const cacheSize = keySize / valuesPerUnit;
            const cacheBuffer = Buffer.alloc(cacheSize, 0);
            writeToFile(this.folder, CACHE_FILE, cacheBuffer, 'wx');
        }
    }

    private isEmpty(buffer: Buffer) {
        return buffer.compare(Buffer.alloc(buffer.length)) === 0;
    }

    private readPublicKey(unitIndex: number, length: number) {
        return readFromFile(this.folder, PUB_KEY_FILE, unitIndex * valuesPerUnit * hashSize, length * valuesPerUnit);
    }

    private readCache(unitIndex: number, length: number) {
        return readFromFile(this.folder, CACHE_FILE, unitIndex * hashSize, length);
    }

    private getSubArrays(i: number, encoded: Buffer, cache: Buffer, pubKey: Buffer) {
        const iEncoded = encoded.subarray(i * hashSize, (i + 1) * hashSize);
        const iCache = cache.subarray(i * hashSize, (i + 1) * hashSize);
        const iPubKey = pubKey.subarray(i * hashSize * valuesPerUnit, (i + 1) * hashSize * valuesPerUnit);
        return { iEncoded, iCache, iPubKey };
    }

    private isValidHashIndex(index: number) {
        return index !== -1 && (index / hashSize === 0 || index / hashSize === 1);
    }

} 