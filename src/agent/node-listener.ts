import { readPendingTransactions, writeTransmittedTransactions } from './db';
import { agentConf } from './agent.conf';
import { BitcoinNode } from './bitcoin-node';


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

const checkNodeInterval = 60000;

export class NodeListener {
    private scheduler: NodeJS.Timeout | null = null;
    private lastBlockHeight: number = 0;
    private lastBlockHash: string = '';
    public client

    constructor() {
        this.client = new BitcoinNode().client
    }

    async setMonitorSchedule() {
        this.scheduler = setInterval(() => {
            this.checkForNewBlock().catch(error => console.error(error));
        }, checkNodeInterval);

        await this.checkForNewBlock();
    }

    async checkForNewBlock() {
        const lastBlockHash = await this.client.getBestBlockHash();
        if (lastBlockHash !== this.lastBlockHash) {
            this.lastBlockHeight = (await this.client.getBlock(lastBlockHash)).height;
            console.log('New block detected:', lastBlockHash, this.lastBlockHeight);
            this.lastBlockHash = lastBlockHash;
            this.monitorTransmitted();
        }
    }

    async monitorTransmitted() {
        const pending = await readPendingTransactions();
        const transmittedTxs: TxData[] = [];
        for (const pendingTx of pending) {
            try {
                const transmittedTx = await this.client.getRawTransaction(pendingTx.txId, true);
                transmittedTx.status.block_height >= this.lastBlockHeight - agentConf.blocksUntilFinalized
                if (transmittedTx && transmittedTx.status.confirmed &&
                    this.lastBlockHeight - transmittedTx.status.block_height >= agentConf.blocksUntilFinalized) {
                    transmittedTxs.push(transmittedTx as TxData);
                }
            } catch (error) { console.log(error); continue }
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
