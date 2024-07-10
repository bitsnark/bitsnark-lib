import { createHash, randomBytes } from "node:crypto";
import { createFolder, readFromFile, isFileExists, getFileSizeBytes, writeToPosInFile, writeToFile, deleteDir, readTextFile, writeTextToFile } from "./files-utils";
import { PRV_KEY_FILE, PUB_KEY_FILE, CACHE_FILE } from "./files-utils";
import { iMerkleProof, PublickKeyMerkleTree } from "./public-key-merkle-tree";
// import { hash } from "../merkle-proof/sha-256";


export const FILE_PREFIX = "lamport-";

const hashSize: number = 32;
const unitBitsSize = 1;
const valuesPerUnit = 2;
const unitsInOneByte = 8;
const bitsInByte = 8;

export interface iDecoded {
    isDecoded: boolean;
    unitIndex: number;
    claim: Buffer;
    //hash: Buffer;

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
    merkleProof: iMerkleProof | undefined;
}


export class Lamport {
    private folder: string;
    private merkle: PublickKeyMerkleTree;

    constructor(folder: string) {
        this.folder = folder;
        this.merkle = new PublickKeyMerkleTree(folder, hashSize, valuesPerUnit);
    }


    public createLamportEquivocationScriptFiles() {
        createFolder(`${this.folder}/$lamport-equivocation`);

        const publickKeySetSize = getFileSizeBytes(this.folder, PUB_KEY_FILE);
        const demoTemplate = readTextFile('template.txt');

        for (let i = 0; i < publickKeySetSize / (hashSize * valuesPerUnit); i++) {
            // let publicKeySetString = this.getUnitHashSet(i, this.folder);
            let publicKeySetString = '';
            for (let s = 0; s < valuesPerUnit; s++) {
                const readFrom = (i * hashSize * valuesPerUnit) + s * hashSize;
                const publicKeyBuffer = readFromFile(this.folder, PUB_KEY_FILE, readFrom, hashSize);
                publicKeySetString += publicKeyBuffer.toString('hex') + ',';
            }

            writeTextToFile(`${this.folder}/$lamport-equivocation`, `${FILE_PREFIX}${i}.txt`,
                this.merkle.createLeafScript(
                    demoTemplate,
                    publicKeySetString,
                    i
                )
            );
        }
    }

    public generateKeys(dataSizeInBits: number): { publicKey: string, privateKey: string, equivocationMerkleRoot: Buffer } {
        createFolder(this.folder);

        if (isFileExists(this.folder, PUB_KEY_FILE)) {
            throw new Error(`Public key file (${PUB_KEY_FILE}) already exists in ${this.folder} directory.\n`);
        }

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

        const equivocationMerkleRoot = this.merkle.createMerkleRootFromPublicKey();
        this.createLamportEquivocationScriptFiles();
        return {
            privateKey: `${this.folder}/${PRV_KEY_FILE}`,
            publicKey: `${this.folder}/${PUB_KEY_FILE}`,
            equivocationMerkleRoot
        };
    }

    public validateMerkleRoot(merkleRoot: Buffer) {
        const newMerkleRoot = this.merkle.createMerkleRootFromPublicKey();
        return newMerkleRoot.compare(merkleRoot) === 0;
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


    private createCachFile() {
        const keySize = getFileSizeBytes(this.folder, PUB_KEY_FILE);
        const cacheSize = keySize / valuesPerUnit;
        const cacheBuffer = Buffer.alloc(cacheSize, 0);
        writeToFile(this.folder, CACHE_FILE, cacheBuffer, 'wx');
    }

    public decodeBuffer(encoded: Buffer, unitIndex: number, merkleRoot: Buffer) {
        if (!isFileExists(this.folder, PUB_KEY_FILE))
            throw Error(`No public key data file (${PUB_KEY_FILE}) was found in ${this.folder} directory.`);

        if (!isFileExists(this.folder, CACHE_FILE)) this.createCachFile();

        const pubKeyBuffer = readFromFile(this.folder,
            PUB_KEY_FILE,
            unitIndex * valuesPerUnit * hashSize,
            encoded.length * valuesPerUnit);

        const cachedBuffer = readFromFile(this.folder,
            CACHE_FILE,
            unitIndex * hashSize,
            encoded.length);


        let byteValue = 0;
        let decodeError = '';

        const resultData = Buffer.alloc(encoded.length / (hashSize * unitsInOneByte));
        const resultConflict = { prv1: Buffer.alloc(0), prv2: Buffer.alloc(0), script: {} };

        const isEmpty = (buffer: Buffer) => buffer.every(byte => byte === 0);

        for (let i = 0; i < encoded.length / hashSize; i++) {
            const iEncoded = encoded.subarray(i * hashSize, (i + 1) * hashSize);
            const iCache = cachedBuffer.subarray(i * hashSize, (i + 1) * hashSize);
            const iPubKey = pubKeyBuffer.subarray(i * hashSize * valuesPerUnit, (i + 1) * hashSize * valuesPerUnit);

            const iHash = createHash('sha256').update(iEncoded).digest();
            const iHashIndex = iPubKey.indexOf(iHash);

            if (iHashIndex !== -1 && (iHashIndex / hashSize === 0 || iHashIndex / hashSize === 1)) {
                if (!isEmpty(iCache) && iCache.compare(iEncoded) !== 0) {
                    resultConflict.prv1 = Buffer.from(iCache);
                    resultConflict.prv2 = Buffer.from(iEncoded);
                    resultConflict.script = this.merkle.getMerkleProof(merkleRoot, unitIndex + i);
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

        if (!isEmpty(resultConflict.prv1) || !isEmpty(resultConflict.prv2)) return resultConflict;
        if (decodeError) throw new Error(decodeError);
        if (encoded.length === hashSize) return byteValue;
        return resultData;
    }



} 