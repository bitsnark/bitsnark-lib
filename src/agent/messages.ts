import { bigintToString, stringToBigint } from "./common";


type MessageType = 'start' | 'join' | 'txkeys' | 'txbody' | 'cosign' | 'error';
type EncodingKeys = bigint[] | bigint[][];

function _assign(target: any, from: any) {
    if (!from) return;
    Object.keys(target)
        .filter(k => k != 'messageType' && from[k])
        .forEach(k => target[k] = from[k]);
}

export class StartMessage {
    messageType: MessageType = 'start';
    setupId: string = '';
    agentId: string = '';
    schnorrPublicKey: string = '';
    signature?: string = '';

    constructor(obj?: Partial<StartMessage>) {
        _assign(this, obj);
    }

    toJSON() {

    }
}

export class JoinMessage {
    messageType: MessageType = 'join';
    setupId: string = '';
    agentId: string = '';
    schnorrPublicKey: string = '';
    signature?: string;

    constructor(obj?: Partial<JoinMessage>) {
        _assign(this, obj);
    }
}

export class TxKeysMessage {
    messageType: MessageType = 'txkeys';
    setupId: string = '';
    agentId: string = '';
    transactionDescriptor: string = '';
    publicKeys: EncodingKeys = [];
    taproot: string = '';

    constructor(obj?: Partial<TxKeysMessage>) {
        _assign(this, obj);
    }
}

export class TxBodyMessage {
    messageType: MessageType = 'txbody';
    setupId: string = '';
    agentId: string = '';
    transactionDescriptor: string = '';
    transactionHash: string = '';
    signature: string = '';

    constructor(obj?: Partial<TxBodyMessage>) {
        _assign(this, obj);
    }
}

export class CosignTxMessage {
    messageType: MessageType = 'cosign';
    setupId: string = '';
    agentId: string = '';
    transactionDescriptor: string = '';
    signature: string = '';

    constructor(obj?: Partial<CosignTxMessage>) {
        _assign(this, obj);
    }
}

export class ErrorMessage {
    messageType: MessageType = 'error';
    setupId: string = '';
    agentId: string = '';
    error: string = '';

    constructor(obj?: Partial<ErrorMessage>) {
        _assign(this, obj);
    }
}

const typeToClass = {
    'start': StartMessage,
    'join': JoinMessage,
    'txkeys': TxKeysMessage,
    'txbody': TxBodyMessage,
    'cosign': CosignTxMessage,
    'error': ErrorMessage
}

export type Message = StartMessage | TxKeysMessage | TxBodyMessage | CosignTxMessage | ErrorMessage;

export function fromJson(json: any): Message {
    const t = (typeToClass as any)[json.messageType];
    if (!t) throw new Error('Invalid message type');
    const m = new t();
    Object.keys(m).forEach(k => {
        if (m[k] && !json[k]) throw new Error('Value expected');
        if (json[k].startsWith && json[k].startsWith('BIGINT:')) {
            const s = json[k] as string;
            m[k] = BigInt(s.replace('BIGINT:', '0x'));
        } else {
            m[k] = json[k];
        }
    });
    return m;
}

export function toJSON(message: Message): any {
    const json = JSON.stringify(message, (key, value) =>
        typeof value === "bigint" ? value.toString() + "n" : value
    );
    return json;
}
