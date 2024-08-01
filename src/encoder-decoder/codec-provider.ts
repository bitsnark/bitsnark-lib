import { Bitcoin } from "../generator/step3/bitcoin";
import { getcontrolBlock } from "./equivocation-tapnode";

export enum eCodecType {
    lamport = 'lamport',
    winternitz32 = 'winternitz32',
    winternitz256 = 'winternitz256',
}

export interface iDecodeResult {
    type: string;
    data?: Buffer;
    error?: string;
    prv1?: Buffer;
    prv2?: Buffer;
    index?: number;
    script?: Buffer
}

export abstract class CodecProvider {
    abstract codecType: eCodecType;
    abstract tmpInnerPubKey: Buffer

    abstract prvKeyFileName: string;
    abstract pubKeyFileName: string;
    abstract cacheFileName: string;

    abstract hashsInUnit: number;
    abstract valuesPerUnit: number;
    abstract prvToPubHashCount: number;

    abstract computeKeyPartsCount(sizeInEncodeUnits: number): number;
    abstract getKeyPartSatrtPosByUnitIndex(unitIndex: number): number;
    abstract getKeyPartsLengthByDataSize(dataSizeInBytes: number, isDataEncoded?: boolean): number
    abstract getCacheSectionStart(unitIndex: number): number;
    abstract getCacheSectionLength(encodedSizeInBytes: number): number;
    abstract calculateCacheSize(): number;
    abstract getUnitCount(): number;

    abstract encodeBit(b: number, indexInBits: number): Buffer | never
    abstract encodeBuffer(data: Buffer, prvKeyBuffer: Buffer): Buffer;
    abstract decodeBuffer(encoded: Buffer, indexInUnits: number, pubKeyParts: Buffer, cache: Buffer): iDecodeResult;

    abstract generateEquivocationScript(bitcoin: Bitcoin, unitIndex: number): void;

    protected isEmpty(buffer: Buffer) {
        return buffer.compare(Buffer.alloc(buffer.length)) === 0;
    }

    public isConflict(iCache: Buffer, iEncoded: Buffer) {
        return !this.isEmpty(iCache) && iCache.compare(iEncoded) !== 0;
    }


    protected returnDecodedConflict(iCache: Buffer, iEncoded: Buffer, despuitedIndex: number) {
        const conflictData = {
            type: 'conflict',
            prv1: Buffer.from(iCache),
            prv2: Buffer.from(iEncoded),
            index: despuitedIndex,
            script: getcontrolBlock(
                this.tmpInnerPubKey,
                this,
                despuitedIndex)
        };
        return conflictData;
    }

    protected returnDecodedError(decodeError: string) {
        return {
            type: 'error',
            errorMessage: decodeError
        };
    }

    protected returnDecodedSuccess(resultData: Buffer) {
        return {
            type: 'success',
            data: resultData
        };
    }
}