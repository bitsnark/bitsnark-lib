import { AgentDb, Template } from '../src/agent/common/db';
import { BitcoinNode } from '../src/agent/common/bitcoin-node';
import { ProtocolProver } from '../src/agent/protocol-logic/protocol-prover';
import { proofBigint } from '../src/agent/common/constants';
import { getTransactionByName, Transaction } from '../src/agent/common/transactions';
import { RawTransaction, Input } from 'bitcoin-core';
import { agentConf } from '../src/agent/agent.conf';

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
    dbs: { prover: AgentDb; verifier: AgentDb };
    setupId: string;
    templates: { prover: Template[]; verifier: Template[] } = { prover: [], verifier: [] };
    bitcoinClient: BitcoinNode;
    scheduler: NodeJS.Timeout | undefined;
    isRunning: boolean = false;

    constructor(proverId: string, verifierId: string, setupId: string) {
        this.agents = { prover: proverId, verifier: verifierId };
        this.setupId = setupId;
        this.bitcoinClient = new BitcoinNode();
        this.dbs = { prover: new AgentDb(proverId), verifier: new AgentDb(verifierId) };
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

                await this.generateBlocks(1);

                const readyToSendTemplates = {
                    prover: await this.dbs.prover.test_getReadyToSendTemplates(this.setupId),
                    verifier: await this.dbs.verifier.test_getReadyToSendTemplates(this.setupId)
                };

                if (!readyToSendTemplates.prover.length && !readyToSendTemplates.verifier.length) {
                    console.log(`No templates to publish`);
                    this.isRunning = false;
                    return;
                }

                const tip = await this.bitcoinClient.client.getBlockCount();
                const hash = await this.bitcoinClient.client.getBlockHash(tip);
                console.log('Curent blockchain tip', tip);

                for (const agent of ['prover', 'verifier'] as const) {
                    const otherAgent = agent === 'prover' ? 'verifier' : 'prover';
                    const agentReadyTemplates = readyToSendTemplates[agent];

                    for (const readyTx of agentReadyTemplates) {
                        const rawTx: RawTransaction = {
                            ...mockRawTransaction,
                            txid: readyTx.object.txId!,
                            vin: this.mockInputs(readyTx, this.templates[agent])
                        };

                        await this.dbs[agent].markReceived(
                            this.setupId,
                            readyTx.name,
                            readyTx.object.txId!,
                            hash,
                            tip,
                            rawTx
                        );

                        await this.dbs[agent].test_markPublished(this.setupId, readyTx.name);

                        await this.dbs[otherAgent].markReceived(
                            this.setupId,
                            readyTx.name,
                            readyTx.object.txId!,
                            hash,
                            tip,
                            rawTx
                        );

                        console.log('Recived incoming transaction', readyTx.object.txId, readyTx.name);
                    }
                }
                this.isRunning = false;
            } catch (e) {
                console.error(e);
                this.isRunning = false;
            }
        }, agentConf.protocolIntervalMs / 3);
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

    private mockInputs(template: Template, templates: Template[]): Input[] {
        return (
            templates
                .find((t) => t.name === template.name)
                ?.object?.inputs.map((input, index) => {
                    return {
                        ...mockVin,
                        txid:
                            getTransactionByName(
                                templates.map((t) => t.object),
                                input.transactionName
                            ).txId ?? '',
                        vout: input.outputIndex,
                        txinwitness:
                            template.data && template.data[index]
                                ? template.data[index].map((witnessElement: Buffer) =>
                                      Buffer.from(witnessElement).toString('hex')
                                  )
                                : []
                    };
                }) || []
        );
    }
    async stop() {
        // Do nothing
    }
}

if (require.main === module) {
    console.log('Starting mock publisher');
    (async () => {
        const proverId = 'bitsnark_prover_1';
        const verifierId = 'bitsnark_verifier_1';
        const setupId = 'test_setup';

        const dbProver = new AgentDb(proverId);
        const dbVerifier = new AgentDb(verifierId);
        await dbProver.test_restartSetup(setupId);
        await dbVerifier.test_restartSetup(setupId);

        const prover = new ProtocolProver(proverId, setupId);
        //Bad
        const boojum = proofBigint;
        boojum[0] = boojum[0] + 1n;
        await prover.pegOut(boojum);
        // Good
        //await prover.pegOut(proofBigint);
        console.log('proof sent:', proofBigint);
        new MockPublisher(proverId, verifierId, setupId).start();
    })();
}
