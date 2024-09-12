
import { Lamport } from "./lamport";
import { Winternitz } from "./winternitz";
import { CodecProvider, CodecType, DecodeData, DecodeError, Decodeconflict } from "./codec-provider";
import { deleteDir } from "./files-utils";


const hashSize = 32;

export class TxDecoder {
    private provider: CodecProvider;

    constructor(codecType: CodecType) {
        if (codecType === CodecType.lamport) {
            this.provider = new Lamport('', CodecType.lamport);
        }
        else if (codecType === CodecType.winternitz32 || codecType === CodecType.winternitz256) {
            this.provider = new Winternitz('', codecType);
        }
        else {
            throw new Error(`Unknown codec ${codecType}`);
        }
    }

    public decodePrvByPub(encoded: Buffer, pubKeySets: Buffer): DecodeData | DecodeError {
        const provider = this.provider;
        return provider.decodePrvByPub(encoded, pubKeySets);
    }

}