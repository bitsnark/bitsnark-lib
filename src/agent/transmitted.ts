import { readPendingTransactions, writeTransmittedTransaction } from './db';
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
const averageBlockTime = 600000;
const recheckInterval = 1000;

export class BlockchainListener {
    private scheduler: NodeJS.Timeout | null = null;
    private lastBlockHeight: number = 0;

    private client = new Client({
        network: 'regtest',
        username: 'rpcuser',
        password: 'rpcpassword',
        host: '127.0.0.1',
        port: 18443

    })

    constructor() {
        this.initialize();
    }

    async initialize() {
        try {
            const { height, time } = await this.getLastBlockByHeightAndTime();
            this.lastBlockHeight = height;
            const initialInterval = this.calculateNextCheckTime(time);
            this.setMonitorInterval(initialInterval);
        } catch (error) {
            console.error('Error fetching block:', error);
        }
    }

    async setMonitorInterval(interval: number) {
        if (this.scheduler) clearInterval(this.scheduler);
        this.scheduler = setInterval(() => {
            this.checkForNewBlock();
        }, interval);
    }

    calculateNextCheckTime(lastBlockTime: number) {
        const nextBlockTime = lastBlockTime * 1000 + averageBlockTime;
        return nextBlockTime - Date.now();
    }

    async getLastBlockByHeightAndTime(): Promise<{ height: number, time: number }> {
        try {
            const blockHash = await this.client.getBestBlockHash();
            const block = await this.client.getBlock(blockHash);
            return { height: block.height, time: block.time };
        } catch (error) {
            console.log(error);
            throw new Error('Error fetching block:' + error);
        }
    }

    async checkForNewBlock() {
        try {
            const { height } = await this.getLastBlockByHeightAndTime();
            if (height > this.lastBlockHeight) {
                this.lastBlockHeight = height;
                this.monitorTransmitted();
            } else {
                this.setMonitorInterval(recheckInterval);
            }
        } catch (error) {
            console.error('Error fetching block:', error);
        }
    }

    async monitorTransmitted() {
        try {
            const pending = await readPendingTransactions();
            for (const pendingTx of pending) {
                const transmittedTx = await this.client.getRawTransaction(pendingTx.txid, true);
                if (transmittedTx && transmittedTx.status.confirmed &&
                    transmittedTx.status.block_height > this.lastBlockHeight - blocksUntilFinalized) {
                    await writeTransmittedTransaction(pendingTx.setupId, transmittedTx as TxData);
                }
            }

            const blockHash = await this.client.getBestBlockHash();
            const block = await this.client.getBlock(blockHash);
            console.log(block);
        } catch (error) {
            console.error('Error fetching block:', error);
        }
    }


    async getPendingTransactionsFromDB() {
        try {
            const transactions = await this.client.getRawMemPool();
            console.log(transactions);
        } catch (error) {
            console.error('Error fetching pending transactions:', error);
        }
    }

}

