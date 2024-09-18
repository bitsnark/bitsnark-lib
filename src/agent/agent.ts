import { agentConf } from "../../agent.conf";
import { AgentRoles, FundingUtxo, saveTxToFile, stringToBigint, TransactionInfo } from "./common";
import { CosignTxMessage, fromJson, JoinMessage, StartMessage, TxKeysMessage } from "./messages";
import { createPresignedTransaction, PresignedTransaction } from "./py-client";
import { SimpleContext, TelegramBot } from "./telegram";
import { allTransactions, getNextTransactionMeta, getPrevTransactionMeta, getTransactionMeta, TransactionCreator, TransactionMeta } from "./transactions";
import { initialize } from "./transactions-new";

interface AgentInfo {
    agentId: string;
    schnorrPublicKey: bigint;
}

class SetupInstance {
    setupId: string;
    myRole: AgentRoles;
    prover?: AgentInfo;
    verifier?: AgentInfo;
    transactions: Map<string, TransactionInfo> = new Map<string, TransactionInfo>();
    proverFundingUtxo?: FundingUtxo;
    payloadUtxo?: FundingUtxo;

    constructor(setupId: string, myRole: AgentRoles, me: AgentInfo, proverUtxo?: FundingUtxo, payloadUtxo?: FundingUtxo) {
        this.setupId = setupId;
        this.myRole = myRole;
        this.prover = myRole == AgentRoles.PROVER ? me : undefined;
        this.verifier = myRole == AgentRoles.VERIFIER ? me : undefined;
        this.proverFundingUtxo = proverUtxo;
        this.payloadUtxo = payloadUtxo;
    }
}

export class Agent {

    agentId: string;
    role: AgentRoles;
    instances: Map<string, SetupInstance> = new Map<string, SetupInstance>();
    schnorrPublicKey: string;
    bot: TelegramBot;

    constructor(agentId: string, role: AgentRoles) {
        this.agentId = agentId;
        this.role = role;
        this.schnorrPublicKey = (agentConf.keyPairs as any)[this.agentId].public;
        this.bot = new TelegramBot(agentId, this);
    }

    async launch() {
        await this.bot.launch();
    }

    private getInstance(setupId: string): SetupInstance {
        const i = this.instances.get(setupId);
        if (!i) throw new Error('Invalid instance');
        return i;
    }

    private generateTransaction(
        setupId: string,
        meta: TransactionMeta,
        proverPublicKey: bigint,
        verifierPublicKey: bigint,
        wotsPublicKeys?: bigint[]): TransactionInfo {

        const txi = meta.creator(setupId, proverPublicKey, verifierPublicKey, wotsPublicKeys);
        let i = this.getInstance(setupId);
        i.transactions.set(meta.desc, txi);
        return txi;
    }

    public messageReceived(data: string, ctx: SimpleContext): void {
        const tokens = data.split(' ');
        if (this.role == AgentRoles.PROVER && tokens.length == 5 && tokens[0] == '/start') {

            this.start(ctx, tokens[1], {
                txId: tokens[2],
                outputIndex: Number(tokens[3])
            }, {
                txId: tokens[4],
                outputIndex: Number(tokens[5])
            });

        } else if (data.trim().startsWith('{') && data.trim().endsWith('}')) {

            const message = fromJson(data);
            console.log('Message received: ', message);
            if (message.agentId == this.agentId) return;
            const f = (this as any)[`on_${message.messageType}`];
            if (!f) throw new Error('Invalid dispatch');
            f.apply(this, [ctx, message]);

        }
    }

    public start(ctx: SimpleContext, setupId: string, payloadUtxo: FundingUtxo, proverUtxo: FundingUtxo) {

        const i = new SetupInstance(setupId, AgentRoles.PROVER, {
            agentId: this.agentId,
            schnorrPublicKey: stringToBigint(this.schnorrPublicKey)
        }, payloadUtxo, proverUtxo);
        this.instances.set(setupId, i);
        i.prover = {
            agentId: this.agentId,
            schnorrPublicKey: stringToBigint(this.schnorrPublicKey)
        };
        const msg = new StartMessage({
            setupId,
            agentId: this.agentId,
            schnorrPublicKey: this.schnorrPublicKey
        });
        ctx.send(msg);
    }

    private async generateTxAndSign(setupId: string, transactionMeta: TransactionMeta, wotsPublicKeys?: bigint[]): Promise<{
        txInfo: TransactionInfo,
        pyTx: PresignedTransaction
    }> {
        const i = this.getInstance(setupId);

        const previousTx = i.transactions.get(getPrevTransactionMeta(transactionMeta.desc)?.desc);

        const currentTx = this.generateTransaction(setupId, transactionMeta, i.prover!.schnorrPublicKey, i.verifier!.schnorrPublicKey, wotsPublicKeys);

        const nextTxMeta = getNextTransactionMeta(transactionMeta.desc);
        const nextTx = nextTxMeta && this.generateTransaction(setupId, nextTxMeta, i.prover!.schnorrPublicKey, i.verifier!.schnorrPublicKey);

        const schnorrPrivateKey = (agentConf.keyPairs as any)[this.agentId].private;
        const pyTx = await createPresignedTransaction({
            inputs: [{
                txid: previousTx?.txId!,
                vout: 0,
                spentOutput: {
                    scriptPubKey: currentTx?.taprootAddress!,
                    value: agentConf.forwardedValue
                }
            }],
            schnorrPrivateKey,
            outputValue: agentConf.forwardedValue - agentConf.forwardedFeeValue, // todo decreasing outputs
            executionScript: currentTx?.scripts[0]!,
            outputScriptPubKey: nextTx.taprootAddress
        });
        currentTx.txId = pyTx.txid;
        return {
            txInfo: currentTx,
            pyTx
        };
    }

    // senders

    private async sendTxKeysMessage(ctx: SimpleContext, setupId: string, transactionMeta: TransactionMeta) {
        const i = this.getInstance(setupId);

        const txInfo = this.generateTransaction(setupId, transactionMeta, i.prover!.schnorrPublicKey, i.verifier!.schnorrPublicKey);

        const reply = new TxKeysMessage({
            setupId,
            agentId: this.agentId,
            transactionDescriptor: transactionMeta.desc,
            wotsPublicKeys: txInfo.wotsPublicKeys,
            taproot: txInfo.taprootAddress.toString('hex')
        });
        ctx.send(reply);
    }

    async sendTxCosignMessage(ctx: SimpleContext, setupId: string, transactionMeta: TransactionMeta, wotsPublicKeys: bigint[]) {
        const i = this.getInstance(setupId);

        const { txInfo, pyTx } = await this.generateTxAndSign(setupId, transactionMeta, wotsPublicKeys);
        i.transactions.set(transactionMeta.desc, txInfo);

        const reply = new CosignTxMessage({
            setupId,
            agentId: this.agentId,
            txDescriptor: transactionMeta.desc,
            txSignature: pyTx.executionSignature,
            txId: pyTx.txid
        });
        ctx.send(reply);
    }

    // handlers

    // verifier receives start message, sends joins message

    public on_start(ctx: SimpleContext, message: StartMessage) {
        let i = this.instances.get(message.setupId);
        if (i) throw new Error('Setup instance already exists');
        i = new SetupInstance(message.setupId, AgentRoles.VERIFIER, {
            agentId: this.agentId,
            schnorrPublicKey: stringToBigint(this.schnorrPublicKey)
        });
        i.prover = {
            agentId: message.agentId,
            schnorrPublicKey: stringToBigint(message.schnorrPublicKey)
        };
        this.instances.set(message.setupId, i);

        initialize(message.setupId, i.prover?.schnorrPublicKey!, i.verifier!.schnorrPublicKey, i.payloadUtxo!, i.proverFundingUtxo!);

        const reply = new JoinMessage({
            setupId: message.setupId,
            agentId: this.agentId,
            schnorrPublicKey: this.schnorrPublicKey
        });
        ctx.send(reply);
    }

    // prover received join message, sends first tx keys message

    on_join(ctx: SimpleContext, message: StartMessage) {
        const i = this.getInstance(message.setupId);

        if (i.verifier) throw new Error('Verifier agent already registered');
        i.verifier = {
            agentId: message.agentId,
            schnorrPublicKey: stringToBigint(message.schnorrPublicKey)
        };
        initialize(message.setupId, i.prover?.schnorrPublicKey!, i.verifier.schnorrPublicKey, i.payloadUtxo!, i.proverFundingUtxo!);
    }

    // prover or verifier receive tx keys, generate the tx and sign
    // then send the next tx keys

    on_txkeys(ctx: SimpleContext, message: TxKeysMessage) {
        const i = this.getInstance(message.setupId);

        const txMeta = getTransactionMeta(message.transactionDescriptor);
        if (!txMeta) throw new Error('Transaction descriptor not found');

        this.sendTxCosignMessage(ctx, message.setupId, txMeta, message.wotsPublicKeys);
    }

    on_cosign(ctx: SimpleContext, message: CosignTxMessage) {
        const i = this.getInstance(message.setupId);

        const txMeta = getTransactionMeta(message.txDescriptor);
        if (!txMeta) throw new Error('Transaction not found');

        const txInfo = i.transactions.get(message.txDescriptor);
        if (!txInfo) throw new Error('Transaction not found');

        // TODO: verify sig

        if (i.myRole == txMeta.role) {
            this.sendTxCosignMessage(ctx, i.setupId, txMeta, txInfo.wotsPublicKeys);
        } else {
            saveTxToFile(txInfo);
            const nextMeta = getNextTransactionMeta(txMeta.desc);
            if (nextMeta) {
                this.sendTxKeysMessage(ctx, i.setupId, nextMeta);
            }
        }
    }
}

console.log('Starting...');

const agentId = process.argv[2] ?? 'bitsnark_prover_1';
const role = agentId.indexOf('prover') >= 0 ? AgentRoles.PROVER : AgentRoles.VERIFIER;

const agent = new Agent(agentId, role);
agent.launch().then(() => {
    console.log('Quitting...');
});
