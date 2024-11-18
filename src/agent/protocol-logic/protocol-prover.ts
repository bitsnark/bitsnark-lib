import { RawTransaction } from 'bitcoin-core';
import { agentConf } from '../agent.conf';
import { BitcoinNode } from '../bitcoin-node';
import { AgentRoles, iterations, last, TransactionNames, twoDigits } from '../common';
import {
    Incoming,
    OutgoingStatus,
    readActiveSetups,
    readIncomingTransactions,
    readOutgingByTemplateId,
    readTemplates,
    SetupStatus,
    writeOutgoing,
    writeSetupStatus
} from '../db';
import { createUniqueDataId, getTransactionByName, SpendingCondition, Transaction } from '../transactions-new';
import { bufferToBigintBE, encodeWinternitz256_4 } from '../winternitz';
import { parseTransactionData } from './parser';
import { calculateStates } from './states';
import { makeArgument } from './argument';

export class ProtocolProver {
    agentId: string;
    setupId: string;
    bitcoinClient: BitcoinNode;
    templates: Transaction[] = [];

    constructor(agentId: string, setupId: string) {
        this.agentId = agentId;
        this.setupId = setupId;
        this.bitcoinClient = new BitcoinNode();
    }

    public async pegOut(proof: bigint[]) {
        await this.sendProof(proof);
    }

    public async process() {
        if (!this.templates) {
            this.templates = await readTemplates(this.agentId, this.setupId);
        }

        // read all incoming transactions
        const incoming = await readIncomingTransactions(this.setupId);
        if (incoming.length == 0) {
            // nothing to do
            return;
        }

        // pair them
        const pairs = incoming
            .map((it) => {
                const template = this.templates.find((t) => t.templateId === it.templateId);
                if (!template) throw new Error('Missing template for incoming transaction: ' + it.templateId);
                return { incoming: it, template };
            })
            // order logically
            .sort((p1, p2) => p1.template.ordinal! - p2.template.ordinal!);

        const selectionPathUnparsed: Buffer[][] = [];
        const selectionPath: number[] = [];
        let proof: bigint[] = [];

        // examine each one
        for (const pair of pairs) {
            const lastFlag = pair === last(pairs);

            switch (pair.template.transactionName) {
                case TransactionNames.PROOF:
                    if (lastFlag) {
                        // did the timeout expire?
                        const timeoutSc = await this.checkTimeout(pair.incoming, pair.template);
                        if (timeoutSc) await this.sendProofUncontested();
                    } else {
                        // let's get the proof so we can run the verifier on it
                        proof = this.parseProof(pair.incoming, pair.template);
                    }
                    break;
                case TransactionNames.PROOF_UNCONTESTED:
                    // we won, mark it
                    await this.updateSetupStatus(SetupStatus.PEGOUT_SUCCESSFUL);
                    break;
                case TransactionNames.CHALLENGE:
                    if (lastFlag) {
                        // send the first state iteration
                    }
                    break;
                case TransactionNames.CHALLENGE_UNCONTESTED:
                    // we lost, mark it
                    await this.updateSetupStatus(SetupStatus.PEGOUT_FAILED);
                    break;
                case TransactionNames.ARGUMENT:
                    if (lastFlag) {
                        // did the timeout expire?
                        const timeoutSc = await this.checkTimeout(pair.incoming, pair.template);
                        if (timeoutSc) await this.sendArgumentUncontested();
                    }
                    break;
                case TransactionNames.ARGUMENT_UNCONTESTED:
                    // we won, mark it
                    await this.updateSetupStatus(SetupStatus.PEGOUT_SUCCESSFUL);
                    break;
            }

            if (pair.template.transactionName.startsWith(TransactionNames.STATE)) {
                if (lastFlag) {
                    // did the timeout expire?
                    const timeoutSc = await this.checkTimeout(pair.incoming, pair.template);
                    if (timeoutSc) await this.sendStateUncontested(selectionPath.length);
                }
            }
            if (pair.template.transactionName.startsWith(TransactionNames.STATE_UNCONTESTED)) {
                // we won, mark it
                await this.updateSetupStatus(SetupStatus.PEGOUT_SUCCESSFUL);
                break;
            }
            if (pair.template.transactionName.startsWith(TransactionNames.SELECT)) {
                const rawTx = pair.incoming.rawTransaction as RawTransaction;
                selectionPathUnparsed.push(rawTx.vin[0].txinwitness!.map((s) => Buffer.from(s, 'hex')));
                const selection = this.parseSelection(pair.incoming, pair.template);
                selectionPath.push(selection);
                if (lastFlag) {
                    if (selectionPath.length + 1 < iterations) await this.sendState(proof, selectionPath);
                    else await this.sendArgument(proof, selectionPath, selectionPathUnparsed);
                }
            }
            if (pair.template.transactionName.startsWith(TransactionNames.SELECT_UNCONTESTED)) {
                // we lost, mark it
                await this.updateSetupStatus(SetupStatus.PEGOUT_FAILED);
                break;
            }
        }
    }

    private async sendTransaction(name: string, data?: Buffer[][]) {
        const template = getTransactionByName(this.templates, name);
        // find the pre-signed message
        const presigned = await readOutgingByTemplateId(template.templateId!);
        if (!presigned) throw new Error('Outgoing transaction not found: ' + template.templateId);
        await writeOutgoing(presigned.template_id, data, OutgoingStatus.READY);
    }

    private async sendProof(proof: bigint[]) {
        const data = proof
            .map((n, dataIndex) =>
                encodeWinternitz256_4(n, createUniqueDataId(this.setupId, TransactionNames.PROOF, 0, 0, dataIndex))
            )
            .flat();
        await this.sendTransaction(TransactionNames.PROOF, [data]);
    }

    private async sendProofUncontested() {
        await this.sendTransaction(TransactionNames.PROOF_UNCONTESTED);
    }

    private parseProof(incoming: Incoming, template: Transaction): bigint[] {
        const rawTx = incoming.rawTransaction as RawTransaction;
        const proof = parseTransactionData(
            this.templates,
            template,
            rawTx.vin[0].txinwitness!.map((s) => Buffer.from(s, 'hex'))
        );
        return proof;
    }

    private async updateSetupStatus(status: SetupStatus) {
        await writeSetupStatus(this.setupId, status);
    }

    private async sendArgument(proof: bigint[], selectionPath: number[], selectionPathUnparsed: Buffer[][]) {
        const argumentData = await makeArgument(this.setupId, proof, selectionPath, selectionPathUnparsed);
        await this.sendTransaction(TransactionNames.ARGUMENT, argumentData);
    }

    private async sendArgumentUncontested() {
        await this.sendTransaction(TransactionNames.ARGUMENT_UNCONTESTED);
    }

    private async sendStateUncontested(iteration: number) {
        await this.sendTransaction(TransactionNames.STATE_UNCONTESTED + '_' + twoDigits(iteration));
    }

    private parseSelection(incoming: Incoming, template: Transaction): number {
        const rawTx = incoming.rawTransaction as RawTransaction;
        const data = parseTransactionData(
            this.templates,
            template,
            rawTx.vin[0].txinwitness!.map((s) => Buffer.from(s, 'hex'))
        );
        return Number(data[0]);
    }

    private async sendState(proof: bigint[], selectionPath: number[]) {
        const iteration = selectionPath.length;
        const states = await calculateStates(proof, selectionPath);
        const txName = TransactionNames.STATE + '_' + twoDigits(iteration);
        const statesWi = states
            .map((s, dataIndex) =>
                encodeWinternitz256_4(bufferToBigintBE(s), createUniqueDataId(this.setupId, txName, 0, 0, dataIndex))
            )
            .flat();
        await this.sendTransaction(txName, [statesWi]);
    }

    private async getCurrentBlockHeight(): Promise<number> {
        return await this.bitcoinClient.getBlockCount();
    }

    private async checkTimeout(incoming: Incoming, template: Transaction): Promise<SpendingCondition | null> {
        // check if any spending condition has a timeout that already expired
        const currentBlockHeight = await this.getCurrentBlockHeight();
        for (const output of template.outputs) {
            for (const sc of output.spendingConditions) {
                if (sc.nextRole != AgentRoles.PROVER) continue;
                if (sc.timeoutBlocks && incoming.blockHeight + sc.timeoutBlocks <= currentBlockHeight) {
                    // found one, send the relevant tx
                    return sc;
                }
            }
        }
        return null;
    }
}

export async function main(agentId: string) {
    const setups = await readActiveSetups();
    const doit = async () => {
        for (const setup of setups) {
            const protocol = new ProtocolProver(agentId, setup.setup_id);
            try {
                await protocol.process();
            } catch (e) {
                console.error(e);
            }
        }
    };

    do {
        doit();
        await new Promise((r) => setTimeout(r, agentConf.protocolIntervalMs));
        /*eslint no-constant-condition: "off"*/
    } while (true);
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    const agentId = process.argv[2] ?? 'bitsnark_prover_1';
    main(agentId).catch(console.error);
}
