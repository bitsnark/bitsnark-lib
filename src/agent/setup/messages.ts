import { Transaction } from '../common/transactions';
import { FundingUtxo } from '../common/types';

type MessageType = 'start' | 'join' | 'transactions' | 'signatures' | 'done' | 'error';

function _assign<T extends Message>(target: T, from?: Partial<T>) {
    if (!from) return;
    Object.keys(target)
        .filter((k) => k != 'messageType' && from[k as keyof T] !== undefined)
        .forEach((k) => {
            const key = k as keyof T;
            target[key] = from[key] as T[keyof T];
        });
}

export class StartMessage {
    messageType: MessageType = 'start';
    setupId: string = '';
    agentId: string = '';
    schnorrPublicKey: string = '';
    payloadUtxo?: FundingUtxo;
    proverUtxo?: FundingUtxo;
    telegramMessageSig: string = '';

    constructor(obj?: Partial<StartMessage>) {
        _assign(this, obj);
    }
}

export class JoinMessage {
    messageType: MessageType = 'join';
    setupId: string = '';
    agentId: string = '';
    schnorrPublicKey: string = '';
    telegramMessageSig: string = '';

    constructor(obj?: Partial<JoinMessage>) {
        _assign(this, obj);
    }
}

export interface SpendingConditionWithWotsKeys {
    wotsPublicKeys?: Buffer[][];
}

export interface OutputWithWotsKeys {
    spendingConditions: SpendingConditionWithWotsKeys[];
}

export interface TransactionWithWotsKeys {
    transactionName: string;
    outputs: OutputWithWotsKeys[];
}

export class TransactionsMessage {
    messageType: MessageType = 'transactions';
    setupId: string = '';
    agentId: string = '';
    transactions: TransactionWithWotsKeys[] = [];
    telegramMessageSig: string = '';

    static make(agentId: string, setupId: string, templates: Transaction[]): TransactionsMessage {
        const thus = new TransactionsMessage();
        thus.setupId = setupId;
        thus.agentId = agentId;
        thus.transactions = templates.map((t) => ({
            transactionName: t.transactionName,
            outputs: t.outputs.map((o) => ({
                spendingConditions: o.spendingConditions.map((sc) => ({
                    wotsPublicKeys: sc.wotsPublicKeys!
                }))
            }))
        }));
        return thus;
    }

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
    telegramMessageSig: string = '';

    constructor(obj?: Partial<SignaturesMessage>) {
        _assign(this, obj);
    }
}

export class DoneMessage {
    messageType: MessageType = 'done';
    setupId: string = '';
    agentId: string = '';
    telegramMessageSig: string = '';

    constructor(obj?: Partial<DoneMessage>) {
        _assign(this, obj);
    }
}

export class ErrorMessage {
    messageType: MessageType = 'error';
    setupId: string = '';
    agentId: string = '';
    error: string = '';
    telegramMessageSig: string = '';

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
