import { FundingUtxo } from './common';
import { Transaction } from './transactions-new';

type MessageType = 'start' | 'join' | 'transactions' | 'signatures' | 'done' | 'error';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _assign(target: any, from: any) {
    if (!from) return;
    Object.keys(target)
        .filter((k) => k != 'messageType' && from[k])
        .forEach((k) => (target[k] = from[k]));
}

export class StartMessage {
    messageType: MessageType = 'start';
    setupId: string = '';
    agentId: string = '';
    schnorrPublicKey: string = '';
    signature: string = '';
    payloadUtxo?: FundingUtxo;
    proverUtxo?: FundingUtxo;
    schnorrMessageSig: string = '';

    constructor(obj?: Partial<StartMessage>) {
        _assign(this, obj);
    }
}

export class JoinMessage {
    messageType: MessageType = 'join';
    setupId: string = '';
    agentId: string = '';
    schnorrPublicKey: string = '';
    signature: string = '';

    constructor(obj?: Partial<JoinMessage>) {
        _assign(this, obj);
    }
}

export class TransactionsMessage {
    messageType: MessageType = 'transactions';
    setupId: string = '';
    agentId: string = '';
    transactions: Transaction[] = [];
    signature: string = '';

    constructor(obj?: Partial<TransactionsMessage>) {
        _assign(this, obj);
    }
}

export class Signed {
    transactionName: string = '';
    txId: string = '';
    signatures: string[] = [];
}

export class SignaturesMessage {
    messageType: MessageType = 'signatures';
    setupId: string = '';
    agentId: string = '';
    signed: Signed[] = [];
    signature: string = '';

    constructor(obj?: Partial<SignaturesMessage>) {
        _assign(this, obj);
    }
}

export class DoneMessage {
    messageType: MessageType = 'done';
    setupId: string = '';
    agentId: string = '';
    signature: string = '';

    constructor(obj?: Partial<SignaturesMessage>) {
        _assign(this, obj);
    }
}

export class ErrorMessage {
    messageType: MessageType = 'error';
    setupId: string = '';
    agentId: string = '';
    error: string = '';
    signature: string = '';

    constructor(obj?: Partial<ErrorMessage>) {
        _assign(this, obj);
    }
}

const typeToClass = {
    start: StartMessage,
    join: JoinMessage,
    transactions: TransactionsMessage,
    signatures: SignaturesMessage,
    done: DoneMessage,
    error: ErrorMessage
};

export type Message = StartMessage | TransactionsMessage | SignaturesMessage | DoneMessage | ErrorMessage;

export function fromJson(json: string): Message {
    const obj = JSON.parse(json, (key, value) => {
        if (typeof value === 'string' && value.startsWith('0x') && value.endsWith('n'))
            return BigInt(value.replace('n', ''));
        if (typeof value === 'string' && value.startsWith('hex:')) return Buffer.from(value.replace('hex:', ''), 'hex');
        return value;
    });
    const t = typeToClass[obj.messageType as MessageType];
    if (!t) throw new Error('Invalid message type');
    const m = new t();
    Object.keys(m).forEach((k) => {
        const key = k as keyof Message;
        m[key] = obj[key];
    });
    return m;
}

export function toJson(message: Message): string {
    const json = JSON.stringify(message, (key, value) => {
        if (typeof value === 'bigint') return `0x${value.toString(16)}n`;
        if (value?.type == 'Buffer' && value.data) {
            return 'hex:' + Buffer.from(value.data).toString('hex');
        }
        return value;
    });
    return json;
}
