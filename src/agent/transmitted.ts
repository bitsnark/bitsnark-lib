import { readPendingTransactions, writeTransmittedTransactions } from './db';
const Client = require('bitcoin-core');


export interface TxData {
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


const blocksUntilFinalized = 6;
const checkNodeInterval = 100000;

export class BlockchainListener {
    private scheduler: NodeJS.Timeout | null = null;
    private lastBlockHeight: number = 0;
    private lastBlockHash: string = '';

    private client = new Client({
        network: 'regtest',
        username: 'rpcuser',
        password: 'rpcpassword',
        host: '127.0.0.1',
        port: 18443

    })

    constructor() {
        this.initialize().catch(error => {
            console.error('Error during initialization:', error);
        });
    }

    async initialize() {
        ({
            height: this.lastBlockHeight,
            hash: this.lastBlockHash
        } = await this.getLastBlockByHeightAndTime());

        this.scheduler = setInterval(() => {
            this.checkForNewBlock().catch(error => console.error(error));
        }, checkNodeInterval);

        await this.monitorTransmitted();
    }

    async getLastBlockByHeightAndTime(): Promise<{ height: number, hash: string }> {
        const blockHash = await this.client.getBestBlockHash();
        const block = await this.client.getBlock(blockHash);
        return { height: block.height, hash: blockHash };
    }

    async checkForNewBlock() {
        const lastBlockHash = await this.client.getBestBlockHash();
        if (lastBlockHash !== this.lastBlockHash) {
            this.lastBlockHash = lastBlockHash;
            this.monitorTransmitted();
        }
    }

    async monitorTransmitted() {
        const pending = await readPendingTransactions();
        const transmittedTxs: TxData[] = [];

        for (const pendingTx of pending) {
            try {
                const transmittedTx = await this.client.getRawTransaction(pendingTx.txid, true);
                if (transmittedTx && transmittedTx.status.confirmed &&
                    transmittedTx.status.block_height > this.lastBlockHeight - blocksUntilFinalized) {
                    transmittedTx.push(transmittedTx as TxData);
                }
            } catch (error) { continue }
        }

        if (transmittedTxs.length) await writeTransmittedTransactions(transmittedTxs);
    }

    destroy() {
        if (this.scheduler) {
            clearInterval(this.scheduler);
            this.scheduler = null;
        }
    }
}

new BlockchainListener();