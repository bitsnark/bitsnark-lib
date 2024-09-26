import { FundingUtxo } from "./common";
import { Transaction } from "./transactions-new";

type MessageType = 'start' | 'join' | 'transactions' | 'keys' | 'signatures' | 'done' | 'error';

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
    payloadUtxo?: FundingUtxo;
    proverUtxo?: FundingUtxo;

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

export class TransactionsMessage {
    messageType: MessageType = 'transactions';
    setupId: string = '';
    agentId: string = '';
    transactions: Transaction[] = [];

    constructor(obj?: Partial<TransactionsMessage>) {
        _assign(this, obj);
    }
}

export class TxKeys {
    transactionName: string = '';
    wotsKeys: Buffer[][][][] = [];
}

export class TxKeysMessage {
    messageType: MessageType = 'keys';
    setupId: string = '';
    agentId: string = '';
    txKeys: TxKeys[] = [];

    constructor(obj?: Partial<TxKeysMessage>) {
        _assign(this, obj);
    }
}

class Signed {
    transactionName: string = '';
    txId: string = '';
    signature: string = ''
}

export class SignaturesMessage {
    messageType: MessageType = 'signatures';
    setupId: string = '';
    agentId: string = '';
    signed: Signed[] = [];

    constructor(obj?: Partial<SignaturesMessage>) {
        _assign(this, obj);
    }
}

export class DoneMessage {
    messageType: MessageType = 'done';
    setupId: string = '';
    agentId: string = '';

    constructor(obj?: Partial<SignaturesMessage>) {
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
    'transactions': TxKeysMessage,
    'keys': TxKeysMessage,
    'signatures': SignaturesMessage,
    'done': DoneMessage,
    'error': ErrorMessage
}

export type Message = StartMessage | TransactionsMessage | TxKeysMessage | SignaturesMessage | DoneMessage | ErrorMessage;

export function fromJson(json: string): Message {
    const obj = JSON.parse(json, (key, value) =>{
        if (typeof value === 'string' && value.startsWith('0x') && value.endsWith('n'))
            return BigInt(value.replace('n', ''));
        if (typeof value === 'string' && value.startsWith('hex:'))
            return Buffer.from(value.replace('hex:', ''), 'hex');
        return value;
    });
    const t = (typeToClass as any)[obj.messageType];
    if (!t) throw new Error('Invalid message type');
    const m = new t();
    Object.keys(m).forEach(k => {
        // if (m[k] && !obj[k]) throw new Error('Value expected');
        m[k] = obj[k];
    });
    return m;
}

export function toJson(message: Message): string {
    const json = JSON.stringify(message, (key, value) =>{
        if (typeof value === "bigint") return `0x${value.toString(16)}n`;
        if (value?.type == "Buffer" && value.data) {
            return 'hex:' + Buffer.from(value.data).toString('hex');
        }
        return value;
    });
    return json;
}
