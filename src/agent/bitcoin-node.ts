import { agentConf } from "./agent.conf";
//import cannot find module 'bitcoin-core'
const Client = require('bitcoin-core');



export interface TxRawData {
    in_active_chain?: boolean;
    hex: string;
    txid: string;
    hash: string;
    size: number;
    vsize: number;
    weight: number;
    version: number;
    locktime: number;
    vin: Array<{
        txid: string;
        vout: number;
        scriptSig: {
            asm: string;
            hex: string;
        };
        sequence: number;
        txinwitness?: string[];
    }>;
    vout: Array<{
        value: number;
        n: number;
        scriptPubKey: {
            asm: string;
            hex: string;
            reqSigs?: number;
            type: string;
            addresses?: string[];
        };
    }>;
    blockhash: string;
    confirmations: number;
    blocktime: number;
    time: number;
    setupId?: string; // Optional field
}

export interface TxData {
    amount: number;
    fee: number;
    confirmations: number;
    generated: boolean;
    trusted: boolean;
    blockhash: string;
    blockheight: number;
    blockindex: number;
    blocktime: number;
    txid: string;
    walletconflicts: string[];
    time: number;
    timereceived: number;
    comment?: string;
    bip125Replaceable: "yes" | "no" | "unknown";
    details: Array<{
        involvesWatchonly: boolean;
        address: string;
        category: "send" | "receive" | "generate" | "immature" | "orphan";
        amount: number;
        label?: string;
        vout: number;
        fee?: number;
        abandoned?: boolean;
    }>;
    hex: string;
    decoded?: any; // The structure of 'decoded' can be complex, so 'any' is used here. You can define it more precisely if needed.
    setupId?: string; // Optional field

}
///////
export interface TxRawDataOld {
    txid: string;
    version: number;
    locktime: number;
    size: number;
    weight: number;
    fee: number;
    vin: Vin[];
    vout: Vout[];
    status: TxStstus;
    setupId?: string; // custom field added for db update
}

export interface Vin {
    txid: string;
    vout: number;
    scriptsig: string;
    sequence: number;
    witness: string[];
    prevout: Vout;
}

export interface Vout {
    scriptpubkey: string;
    value: number;
    scriptpubkey_asm: string;
    scriptpubkey_type: string;
    scriptpubkey_address: string;
}

export interface TxStstus {
    confirmed: boolean;
    block_height: number;
    block_hash: string;
    block_time: number;
}

export class BitcoinNode {
    public client

    constructor() {
        this.client = new Client({
            network: agentConf.bitcoinNodeNetwork,
            username: agentConf.bitcoinNodeUsername,
            password: agentConf.bitcoinNodePassword,
            host: agentConf.bitcoinNodeHost,
            port: agentConf.bitcoinNodePort

        })
    }
}
