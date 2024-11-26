declare module "bitcoin-core" {
    export default class Client {
        constructor(options: ClientOptions);
        getBlock(blockHash: string): Promise<Block>;
        getRawTransaction(txid: string, verbose: boolean, blockhash: string): Promise<RawTransaction>;
        getBestBlockHash(): Promise<string>;
        getTransaction(txid: string): Promise<TransactionData>;
        getBlock(blockHash: string, verbosity?: number): Promise<Block>;
        getBlockCount(): Promise<number>;
        getBlockHash(blockHeight: number): Promise<string>;
        getTxOut(txid: string, vout: number, include_mempool: boolean): Promise<TxOut | null>;
    }

    export interface ClientOptions {
        network: string;
        username: string;
        password: string;
        host: string;
        port: number;
    }

    export interface Block {
        hash: string;                   // The block hash (same as provided)
        confirmations: number;          // The number of confirmations, or -1 if the block is not on the main chain
        size: number;                   // The block size
        strippedsize: number;           // The block size excluding witness data
        weight: number;                 // The block weight as defined in BIP 141
        height: number;                 // The block height or index
        version: number;                // The block version
        versionHex: string;             // The block version formatted in hexadecimal
        merkleroot: string;             // The merkle root
        tx: string[];                   // Array of transaction IDs
        time: number;                   // The block time expressed in UNIX epoch time
        mediantime: number;             // The median block time expressed in UNIX epoch time
        nonce: number;                  // The nonce
        bits: string;                   // The bits in hexadecimal format
        difficulty: number;             // The difficulty
        chainwork: string;              // Expected number of hashes required to produce the chain up to this block (in hex)
        nTx: number;                    // The number of transactions in the block
        previousblockhash?: string;     // The hash of the previous block (optional, since it may not be present for the first block)
        nextblockhash?: string;         // The hash of the next block (optional, since it may not be present for the last block)
    }

    export interface RawTransaction {
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

    export interface TransactionData {
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        decoded?: any; // The structure of 'decoded' can be complex, so 'any' is used here. You can define it more precisely if needed.
        setupId?: string; // Optional field
    }

    export interface TxOut {
        bestblock: string;
        confirmations: number;
        value: number;
        scriptPubKey: {
            asm: string;
            hex: string;
            reqSigs: number;
            type: string;
            addresses: string[];
        };
        coinbase: boolean;
    }

}
