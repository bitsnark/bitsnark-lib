import { createHash, randomBytes } from "node:crypto";
import { createFolder, readFromFile, isFileExists, getFileSizeBytes, writeToPosInFile, writeToFile, deleteDir, readTextFile, writeTextToFile } from "./files-utils";
import { PRV_KEY_FILE, PUB_KEY_FILE, CACHE_FILE } from "./files-utils";
export const FILE_PREFIX = "lamport-";

const hashSize: number = 32;
const valuesPerUnit = 2;
const unitsInOneByte = 8;
const bitsInByte = 8;

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
        const prvKeyBuffer = this.readBufferFromPrvKeyFileByBits(indexInBits, buffer.length)

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
        const pubKeyBuffer = this.readBufferFromPubKeyFileByBits(indexInBits, buffer.length)

        return { pubk: pubKeyBuffer, encodedData: this.encodeBuffer(buffer, indexInBits) };
    }

    public decodeBuffer(encoded: Buffer, unitIndex: number, merkleRoot: Buffer) {
        this.initCacheFile();
        const pubKey = this.readBufferFromPubKeyFileByUnits(unitIndex, encoded.length);
        const cache = this.readBufferFromCachedFile(unitIndex, encoded.length);
        const resultData = Buffer.alloc(encoded.length / (hashSize * unitsInOneByte));

        let byteValue = 0;
        let decodeError = '';
        const loopBound = encoded.length / hashSize;

        for (let i = 0; i < loopBound; i++) {
            const { iEncoded, iCache, iPubKey } = this.getSubArrays(i, encoded, cache, pubKey);

            const iHash = createHash('sha256').update(iEncoded).digest();
            const iHashIndex = iPubKey.indexOf(iHash);

            if (!this.isValidHashIndex(iHashIndex)) {
                decodeError +=
                    `Invalid encoded data ${iEncoded.toString('hex')} ==> \n hash: ${iHash.toString('hex')} is not a public key of \n${unitIndex + i} data bit. `;
                byteValue = 0;
                continue;
            }

            if (this.isConflict(iCache, iEncoded)) {
                return this.returnDecodedConflict(iCache, iEncoded);
            }

            byteValue = this.accamulateByte(byteValue, iHashIndex, i);
            if ((i) % bitsInByte === 7) {
                resultData[Math.floor(i / bitsInByte)] = byteValue;
                byteValue = 0;
            }

            this.writeBufferToCachedFile(unitIndex + i, iEncoded);
        }

        if (decodeError) return this.returnDecodedError(decodeError)
        return this.returnDecodedSuccess(encoded, byteValue, resultData)
    }

    private readBufferFromPubKeyFileByUnits(unitIndex: number, length: number) {
        return readFromFile(this.folder,
            PUB_KEY_FILE,
            unitIndex * valuesPerUnit * hashSize,
            length * valuesPerUnit);
    }

    private readBufferFromPubKeyFileByBits(indexInBits: number, length: number) {
        return this.readBufferFromKeyFileByBits(indexInBits, length, PUB_KEY_FILE);
    }

    private readBufferFromPrvKeyFileByBits(indexInBits: number, length: number) {
        return this.readBufferFromKeyFileByBits(indexInBits, length, PRV_KEY_FILE);
    }

    private readBufferFromKeyFileByBits(index: number, length: number, file: string) {
        return readFromFile(this.folder,
            file,
            index * valuesPerUnit * hashSize,
            length * unitsInOneByte * hashSize * valuesPerUnit);
    }

    private writeBufferToCachedFile(hashIndex: number, encoded: Buffer) {
        writeToPosInFile(this.folder, CACHE_FILE, encoded, hashIndex * hashSize);
    }

    private initCacheFile() {
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

    private readBufferFromCachedFile(unitIndex: number, length: number) {
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

    private accamulateByte(byteValue: number, iHashIndex: number, i: number) {
        return byteValue | ((iHashIndex / hashSize) << (i % bitsInByte));
    }

    private isConflict(iCache: Buffer, iEncoded: Buffer) {
        return !this.isEmpty(iCache) && iCache.compare(iEncoded) !== 0;
    }

    private returnDecodedConflict(iCache: Buffer, iEncoded: Buffer) {
        return {
            type: 'conflict',
            prv1: Buffer.from(iCache),
            prv2: Buffer.from(iEncoded),
            script: {}
        };
    }

    private returnDecodedError(decodeError: string) {
        return {
            type: 'error',
            errorMessage: decodeError
        };
    }

    private returnDecodedSuccess(encoded: Buffer, byteValue: number, resultData: Buffer) {
        return {
            type: 'success',
            data: encoded.length === hashSize ? Buffer.from([byteValue]) : resultData
        };
    }

} 