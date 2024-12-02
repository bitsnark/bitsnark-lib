import {
    dev_ClearIncoming,
    Outgoing,
    OutgoingStatus,
    readReadyOutgoing,
    readTemplates,
    writeIncomingTransaction,
    writeOutgoing
} from '../src/agent/common/db';
import { BitcoinNode } from '../src/agent/common/bitcoin-node';
import { ProtocolProver } from '../src/agent/protocol-logic/protocol-prover';
import { proofBigint } from '../src/agent/common/constants';
import { getTransactionByName, Transaction } from '../src/agent/common/transactions';
import { RawTransaction, Input } from 'bitcoin-core';

export const mockRawTransaction: RawTransaction = {
    in_active_chain: true,
    hex: '0200000001abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef000000006b483045022100abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef022100abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef012103abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef000000000000000002f40100000000000017a914abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd87000000000000000000000000000000000000000000000000',
    txid: '',
    hash: '4e9f7e8d6c5b4c3a2d1f0b9e8f7a6c5d4b3e2a1d0f9e8b7c6a5b4c3d2e1f0a9',
    size: 250,
    vsize: 166,
    weight: 660,
    version: 1,
    locktime: 0,
    vin: [],
    vout: [],
    blockhash: '0000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef',
    confirmations: 42,
    blocktime: 1690000000,
    time: 1690000200,
    setupId: 'mock-setup-id'
};

export const mockVin = {
    txid: 'abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef',
    vout: 1,
    scriptSig: {
        asm: '3045022100abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef022100abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef012103abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef',
        hex: '483045022100abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef022100abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef012103abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef'
    },
    sequence: 4294967295,
    txinwitness: [
        'abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef',
        'abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef'
    ]
};

const mockVout = {
    value: 0.015,
    n: 0,
    scriptPubKey: {
        asm: 'OP_DUP OP_HASH160 76a91489abcdefabbaabbaabbaabbaabbaabbaabbaabba88ac OP_EQUALVERIFY OP_CHECKSIG',
        hex: '76a91489abcdefabbaabbaabbaabbaabbaabbaabbaabba88ac',
        reqSigs: 1,
        type: 'pubkeyhash',
        addresses: ['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa']
    }
};

export class MockPublisher {
    proverId: string;
    verifierId: string;
    setupId: string;
    templates: Transaction[] = [];
    bitcoinClient: BitcoinNode;
    scheduler: NodeJS.Timeout | undefined;
    isRunning: boolean = false;

    constructor(proverId: string, verifierId: string, setupId: string) {
        this.proverId = proverId;
        this.verifierId = verifierId;
        this.setupId = setupId;
        this.bitcoinClient = new BitcoinNode();
    }

    async start() {
        if (!this.templates.length) this.templates = await readTemplates(this.proverId, this.setupId);
        this.templates = this.templates.concat(await readTemplates(this.verifierId, this.setupId));

        if (this.scheduler) clearInterval(this.scheduler);
        this.scheduler = setInterval(async () => {
            try {
                await this.generateBlocks(1);
                if (this.isRunning) return;
                this.isRunning = true;
                const readyOutgoings = await readReadyOutgoing([this.proverId, this.verifierId], this.setupId);

                if (readyOutgoings.length === 0) throw new Error(`No templates to publish`);

                //await this.bitcoinClient.client.generate(6);
                //console.log(this.agentId, 'generated 6 blocks');
                const tip = await this.bitcoinClient.getBlockCount();
                console.log('tip', tip);

                for (const readyTx of readyOutgoings) {
                    const rawTx: RawTransaction = {
                        ...mockRawTransaction,
                        txid: readyTx.transaction_id,
                        vin: this.mockInputs(readyTx)
                    };

                    await writeIncomingTransaction(rawTx, tip, readyTx.template_id);
                    console.log('Inserted incoming transaction', readyTx.template_id, readyTx.raw_tx.transactionName);
                    const otherAgentTemplateID =
                        this.templates.find(
                            (tx) =>
                                tx.transactionName === readyTx.raw_tx.transactionName &&
                                tx.templateId !== readyTx.template_id
                        )?.templateId ?? -1;

                    console.log('Other agent template id', otherAgentTemplateID);
                    await writeIncomingTransaction(rawTx, tip, otherAgentTemplateID);
                    console.log('Inserted incoming transaction', otherAgentTemplateID, readyTx.raw_tx.transactionName);

                    await writeOutgoing(readyTx.template_id, readyTx.data, OutgoingStatus.PUBLISHED);
                    console.log('Updated outgoing transaction', readyTx.template_id, readyTx.raw_tx.transactionName);

                    await writeOutgoing(otherAgentTemplateID, readyTx.data, OutgoingStatus.PUBLISHED);
                    console.log('Updated outgoing transaction', otherAgentTemplateID, readyTx.raw_tx.transactionName);

                    this.isRunning = false;
                }
            } catch (e) {
                console.error(e);
                this.isRunning = false;
            }
        }, 3000);
    }

    async generateBlocks(blocksToGenerate: number) {
        try {
            // Replace with a valid regtest address
            const address = await this.bitcoinClient.client.command('getnewaddress');
            console.log('Generated Address:', address);

            const generatedBlocks = await this.bitcoinClient.client.command(
                'generatetoaddress',
                blocksToGenerate,
                address as string
            );
            console.log('Generated Blocks:', generatedBlocks);
        } catch (error) {
            console.error('Error generating blocks:', error);
        }
    }

    private mockInputs(template: Outgoing): Input[] {
        return (
            this.templates
                .find((t) => t.templateId === template.template_id)
                ?.inputs.map((input, index) => {
                    return {
                        ...mockVin,
                        txid: getTransactionByName(this.templates, input.transactionName).txId ?? '',
                        vout: input.outputIndex,
                        txinwitness: template.data[index]?.map((witnessElement: string) =>
                            Buffer.from(witnessElement).toString('hex')
                        )
                    };
                }) || []
        );
    }
    async stop() {
        // Do nothing
    }
}

console.log('require.main', require.main, module);

if (require.main === module) {
    console.log('Starting mock publisher');
    (async () => {
        const proverId = 'bitsnark_prover_1';
        const verrifirId = 'bitsnark_verifier_1';
        const setupId = 'test_setup';
        await dev_ClearIncoming(setupId);

        const prover = new ProtocolProver(proverId, setupId);
        //Bad
        const boojum = proofBigint;
        boojum[0] = boojum[0] + 1n;
        await prover.pegOut(boojum);
        // Good
        //await prover.pegOut(proofBigint);
        console.log('proof sent:', proofBigint);
        new MockPublisher(proverId, verrifirId, setupId).start();
    })();
}
