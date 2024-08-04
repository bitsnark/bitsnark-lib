
import { Lamport } from "./lamport";
import { Winternitz } from "./winternitz";
import { createFolder, isFileExists, readFromFile, writeToFile } from "./files-utils";
import { createHash, randomBytes } from "node:crypto";
import { CodecProvider, CodecType, DecodeData, DecodeError, Decodeconflict } from "./codec-provider";
import { makeEquivocationTaproot } from "./equivocation-tapnode";


const hashSize = 32;

export class Codec {
    private folder: string;
    private provider: CodecProvider;

    constructor(folder: string, codecType: CodecType) {
        this.folder = folder;
        if (codecType === CodecType.lamport) {
            this.provider = new Lamport(this.folder, CodecType.lamport);
        }
        else if (codecType === CodecType.winternitz32 || codecType === CodecType.winternitz256) {
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

        const totalUnits = provider.computeKeySetsCount(sizeInEncodeUnits)

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

        const prvKeySets = readFromFile(this.folder,
            provider.prvKeyFileName,
            provider.getKeySetsStartPosByUnitIndex(indexInUnits),
            provider.getKeySetsLengthByDataSize(data.length));

        return provider.encodeBuffer(data, prvKeySets);
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

    public decodeBuffer(encoded: Buffer, indexInUnits: number): DecodeData | DecodeError | Decodeconflict {
        const provider = this.provider;
        const folder = this.folder;

        if (!isFileExists(this.folder, provider.pubKeyFileName))
            throw Error(`No public key data file (${provider.pubKeyFileName}) was found in ${folder} directory.`);


        this.initCacheFile();

        const pubKeySets = readFromFile(folder,
            provider.pubKeyFileName,
            provider.getKeySetsStartPosByUnitIndex(indexInUnits),
            provider.getKeySetsLengthByDataSize(encoded.length, true));


        const cache = readFromFile(folder,
            provider.cacheFileName,
            provider.getCacheSectionStart(indexInUnits),
            provider.getCacheSectionLength(encoded.length));

        return provider.decodeBuffer(encoded, indexInUnits, pubKeySets, cache);
    }
}