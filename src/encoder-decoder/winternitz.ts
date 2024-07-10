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

    public createEquivocationScriptFiles(chunckSize32: number) {
        const prefix = chunckSize32 === 32 ? FILE_PREFIX_32 : FILE_PREFIX_4;
        const chunckNibbles = chunckSize32 === 32 ? 90 : 14;

        createFolder(`${this.folder}/${prefix}equivocation`);
        const publickKeySetSize = getFileSizeBytes(this.folder, prefix + PUB_KEY_FILE);
        const demoTemplate = readTextFile('template.txt');

        for (let i = 0; i < publickKeySetSize / (hashSize * chunckNibbles); i++) {
            let publicKeySetString = '';
            for (let s = 0; s < chunckNibbles; s++) {
                const readFrom = (i * hashSize * chunckNibbles) + s * hashSize;
                const publicKeyBuffer = readFromFile(this.folder, prefix + PUB_KEY_FILE, readFrom, hashSize);
                publicKeySetString += publicKeyBuffer.toString('hex') + ',';
            }

            let leafText = demoTemplate.replace('[index]', i.toString());
            leafText = leafText.replace('[publicKeySet]', publicKeySetString);
            writeTextToFile(`${this.folder}/${prefix}equivocation`, `${prefix}${i}.txt`, leafText);
        }
    }

    public generateKeys(totalChuncks32: number, totalChuncks4: number) {
        createFolder(this.folder);

        if (isFileExists(this.folder, FILE_PREFIX_32 + PUB_KEY_FILE) ||
            isFileExists(this.folder, FILE_PREFIX_4 + PUB_KEY_FILE) ||
            isFileExists(this.folder, FILE_PREFIX_32 + PRV_KEY_FILE) ||
            isFileExists(this.folder, FILE_PREFIX_4 + PRV_KEY_FILE)) {
            throw new Error(`Winternitz public key files already exists in ${this.folder} directory.\n`);
        }

        const pairs4 = totalChuncks4 * Math.ceil(chunkSize4 * 8 / nibbleSizeInBits) + totalChuncks4 * checksum4BytesSize;
        const pairs32 = totalChuncks32 * Math.ceil(chunkSize32 * 8 / nibbleSizeInBits) + totalChuncks32 * checksum32BytesSize

        this.generateKeysSet(FILE_PREFIX_32, pairs32);
        this.generateKeysSet(FILE_PREFIX_4, pairs4);
        this.createEquivocationScriptFiles(chunkSize4);
        this.createEquivocationScriptFiles(chunkSize32);

        return {
            [`${FILE_PREFIX_32}privateKey`]: `${this.folder}/${FILE_PREFIX_32}${PRV_KEY_FILE}`,
            [`${FILE_PREFIX_32}publicKey`]: `${this.folder}/${FILE_PREFIX_32}${PUB_KEY_FILE}`,
            [`${FILE_PREFIX_4}privateKey`]: `${this.folder}/${FILE_PREFIX_4}${PRV_KEY_FILE}`,
            [`${FILE_PREFIX_4}publicKey`]: `${this.folder}/${FILE_PREFIX_4}${PUB_KEY_FILE}`,
        };
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
            encodedData: this.encodeBuffer(buffer, chunckIndex, chunkSize32),
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
            encodedData: this.encodeBuffer(buffer, chunckIndex, chunkSize4),
            pubk: pubKeyBuffer
        };
    }

    public encodeBuffer32(buffer: Buffer, chunckIndex: number): Buffer {
        if (buffer.length !== (chunkSize32)) throw new Error('Invalid buffer size');
        return this.encodeBuffer(buffer, chunckIndex, chunkSize32);
    }

    public encodeBuffer4(buffer: Buffer, chunckIndex: number): Buffer {
        if (buffer.length !== (chunkSize4)) throw new Error('Invalid buffer size');
        return this.encodeBuffer(buffer, chunckIndex, chunkSize4);
    }

    private encodeBuffer(buffer: Buffer, chunckIndex: number, chunkSize: number) {
        const nibbleArray = bufferTo3BitArray(buffer);
        const prefix = chunkSize === chunkSize32 ? FILE_PREFIX_32 : FILE_PREFIX_4;
        const checksumSize = chunkSize === chunkSize32 ? checksum32BytesSize : checksum4BytesSize;
        const result = Buffer.alloc((nibbleArray.length + checksumSize) * hashSize);

        const prvKeyBuffer = readFromFile(
            this.folder,
            prefix + PRV_KEY_FILE,
            chunckIndex * (nibbleArray.length + checksumSize) * hashSize,
            (nibbleArray.length + checksumSize) * hashSize);

        let checkSum = 0;
        for (let i = 0; i < nibbleArray.length; i++) {
            checkSum += nibbleArray[i];
            let iPrvKey = prvKeyBuffer.subarray(i * hashSize, (i + 1) * hashSize);
            for (let j = valuesPerUnit - 1; j > nibbleArray[i]; j--) {
                iPrvKey = createHash('sha256').update(iPrvKey).digest();
            }
            iPrvKey.copy(result, i * hashSize, 0, hashSize);
        }

        const checksumBuffer = Buffer.alloc(2);
        checksumBuffer.writeUInt16LE(checkSum);
        const checksumArray = bufferTo3BitArray(checksumBuffer);
        for (let i = nibbleArray.length; i < nibbleArray.length + checksumSize; i++) {
            const iChecksumValue = checksumArray[i - nibbleArray.length];
            let icheckSum = prvKeyBuffer.subarray(i * hashSize, (i + 1) * hashSize);
            for (let j = 0; j < iChecksumValue; j++) {
                icheckSum = createHash('sha256').update(icheckSum).digest();
            }
            icheckSum.copy(result, i * hashSize, 0, hashSize);
        }

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

    private decodeBuffer(encoded: Buffer, chunckIndex: number, chunkSize: number) {
        const prefix = chunkSize === chunkSize32 ? FILE_PREFIX_32 : FILE_PREFIX_4;
        const checksumSize = chunkSize === chunkSize32 ? checksum32BytesSize : checksum4BytesSize;
        const dataNibbles = Math.ceil(chunkSize * 8 / nibbleSizeInBits);

        if (!isFileExists(this.folder, prefix + PUB_KEY_FILE))
            throw Error(`No public key data file (${prefix + PUB_KEY_FILE}) was found in ${this.folder} directory.`);

        const pubKeyBuffer = readFromFile(this.folder,
            prefix + PUB_KEY_FILE,
            chunckIndex * (dataNibbles + checksumSize) * hashSize,
            (dataNibbles + checksumSize) * hashSize);


        let checkSum = 0;
        const nibbleArray = [];
        for (let i = 0; i < dataNibbles; i++) {
            let isDecoded = false;
            let iKey = encoded.subarray(i * hashSize, (i + 1) * hashSize);
            let iPubKey = pubKeyBuffer.subarray(i * hashSize, (i + 1) * hashSize);
            for (let j = 0; j < valuesPerUnit; j++) {
                iKey = createHash('sha256').update(iKey).digest();
                if (iPubKey.compare(iKey) === 0) {
                    nibbleArray.push(j);
                    checkSum += j;
                    isDecoded = true;
                    break;
                }
            }
            if (!isDecoded) throw new Error(`Invalid key nibble ${i} key ${iKey}`);
        }
        const resultData = arrayToBuffer(nibbleArray, chunkSize);

        const checksumBuffer = Buffer.alloc(2);
        checksumBuffer.writeUInt16LE(checkSum);
        const checksumArray = bufferTo3BitArray(checksumBuffer);
        for (let i = dataNibbles; i < dataNibbles + checksumSize; i++) {
            let iChecksumEncoded = encoded.subarray(i * hashSize, (i + 1) * hashSize);
            const ichecksumKey = pubKeyBuffer.subarray(i * hashSize, (i + 1) * hashSize);
            for (let j = valuesPerUnit; j > checksumArray[i - dataNibbles]; j--) {
                iChecksumEncoded = createHash('sha256').update(iChecksumEncoded).digest();
            }
            if (iChecksumEncoded.compare(ichecksumKey) !== 0) throw new Error(`Invalid checksum`);
        }

        if (!isFileExists(this.folder, prefix + CACHE_FILE)) {
            const cache = Buffer.alloc(getFileSizeBytes(this.folder, prefix + PUB_KEY_FILE), 0);
            writeToFile(this.folder, prefix + CACHE_FILE, cache, 'w');
        }

        const pubCacheBuffer = readFromFile(this.folder,
            prefix + CACHE_FILE,
            chunckIndex * (dataNibbles + checksumSize) * hashSize,
            (dataNibbles + checksumSize) * hashSize);

        const isEmpty = (buffer: Buffer) => buffer.every(byte => byte === 0);

        if (isEmpty(pubCacheBuffer)) {
            writeToPosInFile(this.folder, prefix + CACHE_FILE, encoded, chunckIndex * (dataNibbles + checksumSize) * hashSize);
        } else if
            (pubCacheBuffer.compare(encoded.subarray(0, (dataNibbles + checksumSize) * hashSize)) !== 0) {
            throw new Error(`Conflict detected in cache file`);
        }

        return resultData;
    }
}