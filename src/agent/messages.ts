
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

export function fromJson(json: string): Message {
    const obj = JSON.parse(json, (key, value) =>
        typeof value === 'string' && value.startsWith('0x') ?
            BigInt(value) : value);
    const t = (typeToClass as any)[obj.messageType];
    if (!t) throw new Error('Invalid message type');
    const m = new t();
    Object.keys(m).forEach(k => {
        if (m[k] && !obj[k]) throw new Error('Value expected');
        m[k] = obj[k];
    });
    return m;
}

export function toJson(message: Message): string {
    const json = JSON.stringify(message, (key, value) =>
        typeof value === "bigint" ? `0x${value.toString(16)}` : value
    );
    return json;
}
