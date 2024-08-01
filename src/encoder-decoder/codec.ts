
import { Lamport } from "./lamport";
import { Winternitz } from "./winternitz";
import { createFolder, isFileExists, readFromFile, writeToFile } from "./files-utils";
import { createHash, randomBytes } from "node:crypto";
import { CodecProvider, eCodecType, iDecodeResult } from "./codec-provider";
import { EquivocationTapNode, getcontrolBlock, makeEquivocationTaproot } from "./equivocation-tapnode";
import { taprootOutputScript } from "../generator/taproot/taproot";

const tmpInnerPubKey = Buffer.from('55adf4e8967fbd2e29f20ac896e60c3b0f1d5b0efa9d34941b5958c7b0a0312d', 'hex')



const hashSize = 32;

export class Codec {
    private folder: string;
    private provider: CodecProvider;

    constructor(folder: string, codecType: eCodecType) {
        this.folder = folder;
        if (codecType === eCodecType.lamport) {
            this.provider = new Lamport(this.folder, eCodecType.lamport);
        }
        else if (codecType === eCodecType.winternitz32 || codecType === eCodecType.winternitz256) {
            this.provider = new Winternitz(this.folder, codecType);
        }
        else {
            throw new Error(`Unknown codec ${codecType}`);
        }
    }

    public generateKeys(sizeInEncodeUnits: number) {
        const folder = this.folder;
        const provider = this.provider;

        createFolder(folder, true);

        const totalUnits = provider.computeKeyPartsCount(sizeInEncodeUnits)

        for (let i = 0; i < totalUnits; i++) {
            const secretKeyBuffer = randomBytes(hashSize);
            let publicKeyBuffer = secretKeyBuffer;
            for (let j = 0; j < provider.prvToPubHashCount; j++) {
                publicKeyBuffer = createHash('sha256').update(publicKeyBuffer).digest();
            }
            writeToFile(folder, provider.prvKeyFileName, secretKeyBuffer, 'a');
            writeToFile(folder, provider.pubKeyFileName, publicKeyBuffer, 'a');
        }

        return makeEquivocationTaproot(provider.tmpInnerPubKey, provider);
    }

    public encodeBit(b: 0 | 1, indexInUnits: number) {
        return this.provider.encodeBit(b, indexInUnits)
    }

    public encodeBuffer(data: Buffer, indexInUnits: number) {
        const provider = this.provider;

        const prvKeyParts = readFromFile(this.folder,
            provider.prvKeyFileName,
            provider.getKeyPartSatrtPosByUnitIndex(indexInUnits),
            provider.getKeyPartsLengthByDataSize(data.length));

        return provider.encodeBuffer(data, prvKeyParts);
    }

    private initCacheFile() {
        const provider = this.provider

        if (!isFileExists(this.folder, provider.cacheFileName)) {
            writeToFile(this.folder,
                provider.cacheFileName,
                Buffer.alloc(
                    provider.calculateCacheSize(),
                    0),
                'wx');
        }
    }

    public decodeBuffer(encoded: Buffer, indexInUnits: number): iDecodeResult {
        const provider = this.provider;
        const folder = this.folder;

        if (!isFileExists(this.folder, provider.pubKeyFileName))
            throw Error(`No public key data file (${provider.pubKeyFileName}) was found in ${folder} directory.`);


        this.initCacheFile();

        const pubKeyParts = readFromFile(folder,
            provider.pubKeyFileName,
            provider.getKeyPartSatrtPosByUnitIndex(indexInUnits),
            provider.getKeyPartsLengthByDataSize(encoded.length, true));


        const cache = readFromFile(folder,
            provider.cacheFileName,
            provider.getCacheSectionStart(indexInUnits),
            provider.getCacheSectionLength(encoded.length));

        return provider.decodeBuffer(encoded, indexInUnits, pubKeyParts, cache);
    }
}