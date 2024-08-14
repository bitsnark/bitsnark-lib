

type MessageType = 'start' | 'join' | 'txkeys' | 'txbody' | 'cosign' | 'error';
type EncodingKeys = string[] | string[][];

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

    constructor(obj?: any) {
        _assign(this, obj);
    }
}

export class JoinMessage {
    messageType: MessageType = 'join';
    setupId: string = '';
    agentId: string = '';
    schnorrPublicKey: string = '';
    signature?: string;

    constructor(obj?: any) {
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

    constructor(obj?: any) {
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
}

export class CosignTxMessage {
    messageType: MessageType = 'cosign';
    setupId: string = '';
    agentId: string = '';
    transactionDescriptor: string = '';
    signature: string = '';
}

export class ErrorMessage {
    messageType: MessageType = 'error';
    setupId: string = '';
    agentId: string = '';
    error: string = '';
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
        m[k] = json[k];
    });
    return m;
}
