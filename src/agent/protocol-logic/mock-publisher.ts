import { TestAgentDb } from '../../../tests/test-utils/test-utils';
import { BitcoinNode } from '../common/bitcoin-node';
import Client, { RawTransaction, Input } from 'bitcoin-core';
import { agentConf } from '../agent.conf';
import { TemplateStatus, Template } from '../common/types';
import { JoinedTemplate } from '../listener/listener-utils';
import { randomBytes } from 'node:crypto';

export async function generateBlocks(bitcoinClient: Client, blocksToGenerate: number, address?: string) {
    try {
        if (!address) address = (await bitcoinClient.command('getnewaddress')) as string;
        await bitcoinClient.command('generatetoaddress', blocksToGenerate, address as string);
    } catch (error) {
        console.error('Error generating blocks:', error);
    }
}

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
    agents: { prover: string; verifier: string };
    dbs: { prover: TestAgentDb; verifier: TestAgentDb };
    setupId: string;
    templates: { prover: Template[]; verifier: Template[] } = { prover: [], verifier: [] };
    bitcoinClient: BitcoinNode;
    scheduler: NodeJS.Timeout | undefined;
    isRunning: boolean = false;

    constructor(proverId: string, verifierId: string, setupId: string) {
        this.agents = { prover: proverId, verifier: verifierId };
        this.setupId = setupId;
        this.bitcoinClient = new BitcoinNode();
        this.dbs = { prover: new TestAgentDb(proverId), verifier: new TestAgentDb(verifierId) };
    }

    async start() {
        if (!this.templates.prover.length || !this.templates.verifier.length) {
            this.templates.prover = await this.dbs.prover.getTemplates(this.setupId);
            this.templates.verifier = await this.dbs.verifier.getTemplates(this.setupId);
        }

        if (this.scheduler) clearInterval(this.scheduler);

        this.scheduler = setInterval(async () => {
            try {
                if (this.isRunning) return;
                this.isRunning = true;

                await generateBlocks(this.bitcoinClient.client, 1);

                const readyToSendTemplates = {
                    prover: (await this.dbs.prover.getTemplates(this.setupId)).filter(
                        (t) => t.status === TemplateStatus.READY
                    ),
                    verifier: (await this.dbs.verifier.getTemplates(this.setupId)).filter(
                        (t) => t.status === TemplateStatus.READY
                    )
                };

                const receivedTransactions = {
                    prover: (
                        await this.dbs.prover.query(
                            'SELECT received.txid FROM received, templates WHERE received.template_id = templates.id AND templates.setup_id = $1',
                            [this.setupId]
                        )
                    ).rows,
                    verifier: (
                        await this.dbs.verifier.query(
                            'SELECT received.txid FROM received, templates WHERE received.template_id = templates.id AND templates.setup_id = $1',
                            [this.setupId]
                        )
                    ).rows
                };

                if (!readyToSendTemplates.prover.length && !readyToSendTemplates.verifier.length) {
                    this.isRunning = false;
                    return;
                }

                const tip = await this.bitcoinClient.client.getBlockCount();
                const hash = await this.bitcoinClient.client.getBlockHash(tip);

                for (const agent of ['prover', 'verifier'] as const) {
                    const otherAgent = agent === 'prover' ? 'verifier' : 'prover';
                    const agentReadyTemplates = readyToSendTemplates[agent];

                    for (const readyTx of agentReadyTemplates) {
                        const rawTx: RawTransaction = {
                            ...mockRawTransaction,
                            txid: readyTx.txid!,
                            vin: this.mockInputs(
                                readyTx,
                                this.templates[agent].filter((t) => t.setupId === readyTx.setupId)
                            )
                        };
                        console.log('Mock broadcasting transaction:', readyTx.name);

                        if (!rawTx.txid || rawTx.txid == 'undefined') rawTx.txid = randomBytes(32).toString('hex');

                        if (receivedTransactions[agent].every((rt) => rt[0] !== readyTx.txid)) {
                            await this.markReceived(agent, readyTx, hash, tip, rawTx);
                        }

                        await this.dbs[agent].test_markPublished(this.setupId, readyTx.name);

                        if (receivedTransactions[otherAgent].every((rt) => rt[0] !== readyTx.txid)) {
                            this.markReceived(otherAgent, readyTx, hash, tip, rawTx);
                        }
                    }
                }

                this.isRunning = false;
            } catch (e) {
                console.error(e);
                this.isRunning = false;
            }
        }, agentConf.protocolIntervalMs / 3);
    }

    async markReceived(
        agent: 'prover' | 'verifier',
        readyTx: Template,
        hash: string,
        tip: number,
        rawTx: RawTransaction
    ) {
        await this.dbs[agent].listenerDb.markReceived(readyTx, tip, hash, rawTx);
        console.log(`Saved ${readyTx.txid} [${readyTx.name}] was received in ${agent} db`);
    }

    private mockInputs(template: JoinedTemplate, templates: Template[]): Input[] {
        return (
            templates
                .find((t) => t.name === template.name)
                ?.inputs.map((input, index) => {
                    const parentTemplate = templates.find((t) => input.templateName === t.name);

                    return {
                        ...mockVin,
                        txid: parentTemplate?.txid || '',
                        vout: input.outputIndex,
                        txinwitness:
                            template.protocolData && template.protocolData[index] ? template.protocolData[index] : []
                    };
                }) || []
        );
    }
}

async function main() {
    const proverId = 'bitsnark_prover_1';
    const verifierId = 'bitsnark_verifier_1';
    const setupId = 'test_setup';

    new MockPublisher(proverId, verifierId, setupId).start();
}

if (require.main === module) {
    console.log('Starting mock publisher...');
    main();
}
