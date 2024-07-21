import { createHash, randomBytes } from "node:crypto";
import { createFolder, readFromFile, isFileExists, getFileSizeBytes, writeToPosInFile, writeToFile, readTextFile, writeTextToFile } from "./files-utils";
import { PRV_KEY_FILE, PUB_KEY_FILE, CACHE_FILE } from "./files-utils";

export const FILE_PREFIX_32 = "winternitz-32-";
export const FILE_PREFIX_4 = "winternitz-4-";
export const CHECKSUM_PREFIX = "checksum-";

const nibbleSizeInBits = 3;
const valuesPerUnit = 2 ** nibbleSizeInBits;
const hashSize: number = 32;
const chunkSize32 = 32;
const chunkSize4 = 4;
const checksum4BytesSize = 3;
const checksum32BytesSize = 4;


function bufferTo3BitArray(buffer: Buffer) {
    const result = [];
    let bitCount = 0;
    let nibbleValue = 0;
    for (const byte of buffer) {
        for (let i = 0; i < 8; i++) {
            const bit = (byte >> i) & 1;
            nibbleValue = bit * 2 ** bitCount + nibbleValue;
            bitCount++;
            if (bitCount === 3) {
                result.push(nibbleValue);
                nibbleValue = 0;
                bitCount = 0;
            }
        }
    }
    if (bitCount > 0) result.push(nibbleValue);
    return result;
}

function arrayToBuffer(arr: number[], bufferSize: number): Buffer {
    const buffer = Buffer.alloc(bufferSize);
    let byteIndex = 0;
    let bitCount = 0;
    let byteValue = 0;
    for (const value of arr) {
        if (byteIndex >= bufferSize) break; // Break the loop if the buffer is full
        for (let i = 0; i < 3; i++) {
            const bit = (value >> i) & 1;
            byteValue |= bit << bitCount;
            bitCount++;
            if (bitCount === 8) {
                buffer[byteIndex] = byteValue;
                byteValue = 0;
                bitCount = 0;
                byteIndex++;
            }
        }
    }
    return buffer;
}

export class Winternitz {
    private folder: string;

    constructor(folder: string) {
        this.folder = folder;
    }


    public generateKeys(totalChuncks32: number, totalChuncks4: number) {
        createFolder(this.folder, true);

        const pairs4 = totalChuncks4 * Math.ceil(chunkSize4 * 8 / nibbleSizeInBits) + totalChuncks4 * checksum4BytesSize;
        const pairs32 = totalChuncks32 * Math.ceil(chunkSize32 * 8 / nibbleSizeInBits) + totalChuncks32 * checksum32BytesSize

        this.generateKeysSet(FILE_PREFIX_32, pairs32);
        this.generateKeysSet(FILE_PREFIX_4, pairs4);
    }

    private generateKeysSet(prefix: string, totalUnits: number) {
        for (let i = 0; i < totalUnits; i++) {
            const secretKeyBuffer = randomBytes(hashSize);
            let publicKeyBuffer = secretKeyBuffer;
            for (let j = 0; j < valuesPerUnit; j++) {
                publicKeyBuffer = createHash('sha256').update(publicKeyBuffer).digest();
            }
            writeToFile(this.folder, prefix + PRV_KEY_FILE, secretKeyBuffer, 'a');
            writeToFile(this.folder, prefix + PUB_KEY_FILE, publicKeyBuffer, 'a');
        }
    }

    public encodeBuffer32AddPublic(buffer: Buffer, chunckIndex: number): { encodedData: Buffer, pubk: Buffer } {
        if (buffer.length !== (chunkSize32)) throw new Error('Invalid buffer size');

        const pubKeyBuffer = readFromFile(this.folder,
            FILE_PREFIX_32 + PUB_KEY_FILE,
            chunckIndex * 90 * hashSize,
            90 * hashSize);

        return {
            encodedData: this.encodeBuffer(buffer, chunckIndex),
            pubk: pubKeyBuffer
        };
    }

    public encodeBuffer4AddPublic(buffer: Buffer, chunckIndex: number): { encodedData: Buffer, pubk: Buffer } {
        if (buffer.length !== (chunkSize4)) throw new Error('Invalid buffer size');

        const pubKeyBuffer = readFromFile(this.folder,
            FILE_PREFIX_4 + PUB_KEY_FILE,
            chunckIndex * 14 * hashSize,
            14 * hashSize);

        return {
            encodedData: this.encodeBuffer(buffer, chunckIndex),
            pubk: pubKeyBuffer
        };
    }

    public encodeBuffer32(buffer: Buffer, chunckIndex: number): Buffer {
        if (buffer.length !== (chunkSize32)) throw new Error('Invalid buffer size');
        return this.encodeBuffer(buffer, chunckIndex);
    }

    public encodeBuffer4(buffer: Buffer, chunckIndex: number): Buffer {
        if (buffer.length !== (chunkSize4)) throw new Error('Invalid buffer size');
        return this.encodeBuffer(buffer, chunckIndex);
    }

    private getPrefix(chunkSize: number): string {
        return chunkSize === chunkSize32 ? FILE_PREFIX_32 : FILE_PREFIX_4;
    }

    private readBufferFromPrvKeyFile(chunckIndex: number, chunkSize: number) {
        return this.readKeyBufferFromFile(chunckIndex, chunkSize, PRV_KEY_FILE);
    }

    private readBufferFromPubKeyFile(chunckIndex: number, chunkSize: number) {
        return this.readKeyBufferFromFile(chunckIndex, chunkSize, PUB_KEY_FILE);
    }

    private readBufferFromCachedFile(chunckIndex: number, chunkSize: number) {
        return this.readKeyBufferFromFile(chunckIndex, chunkSize, CACHE_FILE);
    }

    private readKeyBufferFromFile(chunckIndex: number, chunkSize: number, file: string) {
        const totalNibbles = chunkSize === chunkSize32 ? 90 : 14;
        return readFromFile(
            this.folder,
            this.getPrefix(chunkSize) + file,
            chunckIndex * totalNibbles * hashSize,
            totalNibbles * hashSize);
    }


    private writeBufferToCachedFile(chunckIndex: number, chunkSize: number, encoded: Buffer) {
        const totalNibbles = chunkSize === chunkSize32 ? 90 : 14;
        writeToPosInFile(this.folder, this.getPrefix(chunkSize) + CACHE_FILE, encoded, chunckIndex * totalNibbles * hashSize);
    }

    private encodeNibble(keyBuffer: Buffer, i: number, times: number) {
        let nibbleKey = keyBuffer.subarray(i * hashSize, (i + 1) * hashSize);
        for (let e = 0; e < times; e++) {
            nibbleKey = createHash('sha256').update(nibbleKey).digest();
        }
        return nibbleKey;
    }

    private checksumToBuffer(checkSum: number) {
        const checksumBuffer = Buffer.alloc(2);
        checksumBuffer.writeUInt16LE(checkSum);
        return checksumBuffer;
    }

    private checksumToNibbleArray(checkSum: number, checksumSize: number) {
        const checksumBuffer = this.checksumToBuffer(checkSum)
        return bufferTo3BitArray(checksumBuffer).slice(0, checksumSize);
    }

    private encodeBuffer(buffer: Buffer, chunkIndex: number) {
        const nibbleArray = bufferTo3BitArray(buffer);
        const prvKeyBuffer = this.readBufferFromPrvKeyFile(chunkIndex, buffer.length);
        const result = Buffer.alloc(prvKeyBuffer.length);

        const checkSum = nibbleArray.reduce((sum, nibble, i) => {
            const nibbleKey = this.encodeNibble(prvKeyBuffer, i, 7 - nibble);
            nibbleKey.copy(result, i * hashSize, 0, hashSize);
            return sum + nibble;
        }, 0);

        const checksumBuffer = this.checksumToBuffer(checkSum);
        const checksumArray = bufferTo3BitArray(checksumBuffer);

        checksumArray.forEach((iChecksumValue, index) => {
            const i = nibbleArray.length + index;
            const nibbleKey = this.encodeNibble(prvKeyBuffer, i, iChecksumValue);
            nibbleKey.copy(result, i * hashSize, 0, hashSize);
        });

        return result;
    }

    public decodeBuffer32(encoded: Buffer, chunckIndex: number) {
        if (encoded.length !== (Math.ceil(chunkSize32 * 8 / nibbleSizeInBits) + checksum32BytesSize) * hashSize) throw new Error('Invalid buffer size');
        return this.decodeBuffer(encoded, chunckIndex, chunkSize32);
    }

    public decodeBuffer4(encoded: Buffer, chunckIndex: number) {
        if (encoded.length !== (Math.ceil(chunkSize4 * 8 / nibbleSizeInBits) + checksum4BytesSize) * hashSize) throw new Error('Invalid buffer size');
        return this.decodeBuffer(encoded, chunckIndex, chunkSize4);
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

    private isEmpty(buffer: Buffer) {
        return buffer.compare(Buffer.alloc(buffer.length)) === 0;
    }

    private initCacheFile(prefix: string) {
        if (!isFileExists(this.folder, prefix + CACHE_FILE)) {
            const cache = Buffer.alloc(getFileSizeBytes(this.folder, prefix + PUB_KEY_FILE), 0);
            writeToFile(this.folder, prefix + CACHE_FILE, cache, 'w');
            return true;
        }
        return false;
    }

    private getcunckCacheBuffer(chunckIndex: number, chunkSize: number) {
        this.initCacheFile(this.getPrefix(chunkSize));
        return this.readBufferFromCachedFile(chunckIndex, chunkSize);
    }

    private decodeBuffer(encoded: Buffer, chunckIndex: number, chunkSize: number) {
        const prefix = chunkSize === chunkSize32 ? FILE_PREFIX_32 : FILE_PREFIX_4;
        const checksumSize = chunkSize === chunkSize32 ? checksum32BytesSize : checksum4BytesSize;
        const dataNibbles = Math.ceil(chunkSize * 8 / nibbleSizeInBits);

        if (!isFileExists(this.folder, prefix + PUB_KEY_FILE))
            throw Error(`No public key data file (${prefix + PUB_KEY_FILE}) was found in ${this.folder} directory.`);

        const pubKeyBuffer = this.readBufferFromPubKeyFile(chunckIndex, chunkSize);

        const nibbleArray = Array.from({ length: dataNibbles }, (_, i) => {
            const iPubKey = pubKeyBuffer.subarray(i * hashSize, (i + 1) * hashSize);
            return this.decodeDataNibble(encoded, i, iPubKey);
        });

        const checkSum = nibbleArray.reduce((sum, current) => sum + current, 0);
        const checksumArray = this.checksumToNibbleArray(checkSum, checksumSize);

        checksumArray.forEach((checksumValue, index) => {
            const i = dataNibbles + index;
            const iChecksumEncoded = this.encodeNibble(encoded, i, 8 - checksumValue);
            const ichecksumKey = pubKeyBuffer.subarray(i * hashSize, (i + 1) * hashSize);
            if (iChecksumEncoded.compare(ichecksumKey) !== 0) throw new Error(`Invalid checksum`);
        });

        const pubCacheBuffer = this.getcunckCacheBuffer(chunckIndex, chunkSize)

        if (this.isEmpty(pubCacheBuffer)) {
            this.writeBufferToCachedFile(chunckIndex, chunkSize, encoded);
        } else if (pubCacheBuffer.compare(encoded) !== 0) {
            throw new Error(`Conflict detected in cache file`);
        }

        return arrayToBuffer(nibbleArray, chunkSize);
    }
}