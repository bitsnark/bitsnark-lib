import { agentConf } from "../../agent.conf";
import { AgentRoles, stringToBigint, TransactionInfo } from "./common";
import { CosignTxMessage, fromJson, JoinMessage, StartMessage, TxKeysMessage } from "./messages";
import { pyMakeTransaction } from "./py-client";
import { SimpleContext, TelegramBot } from "./telegram";
import { allTransactions, getNextTransactionMeta, getPrevTransactionMeta, TransactionCreator, TransactionMeta } from "./transactions";

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

    constructor(setupId: string, myRole: AgentRoles, me: AgentInfo) {
        this.setupId = setupId;
        this.myRole = myRole;
        this.prover = myRole == AgentRoles.PROVER ? me : undefined;
        this.verifier = myRole == AgentRoles.VERIFIER ? me : undefined;
    }
}

export class Agent {

    agentId: string;
    instances: Map<string, SetupInstance> = new Map<string, SetupInstance>();
    schnorrPublicKey: string;
    bot: TelegramBot;

    constructor(agentId: string) {
        this.agentId = agentId;
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

        const txi = meta.creator(proverPublicKey, verifierPublicKey, wotsPublicKeys);
        let i = this.getInstance(setupId);
        i.transactions.set(meta.desc, txi);
        return txi;
    }

    public messageReceived(data: string, ctx: SimpleContext): void {
        const tokens = data.split(' ');
        if (tokens.length == 2 && tokens[0] == '/start') {

            this.start(ctx, tokens[1]);
            ctx.send(`Wait...`);

        } else if (data.trim().startsWith('{') && data.trim().endsWith('}')) {

            const message = fromJson(data);
            if (message.agentId == this.agentId) return;
            const f = (this as any)[`on_${message.messageType}`];
            if (!f) throw new Error('Invalid dispatch');
            f.apply(this, [ctx, message]);

        }
    }

    public start(ctx: SimpleContext, setupId: string) {
        const i = new SetupInstance(setupId, AgentRoles.PROVER, {
            agentId: this.agentId,
            schnorrPublicKey: BigInt(this.schnorrPublicKey)
        });
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

    // senders

    private async sendTxKeysMessage(ctx: SimpleContext, setupId: string, transactionMeta: TransactionMeta) {
        const i = this.getInstance(setupId);
        if (!i) throw new Error('Setup instance not found');

        const previousTx = i.transactions.get(getPrevTransactionMeta(transactionMeta.desc).desc);

        const currentTx = this.generateTransaction(setupId, transactionMeta, i.prover!.schnorrPublicKey, i.verifier!.schnorrPublicKey);

        const nextTxMeta = getNextTransactionMeta(transactionMeta.desc);
        const nextTx = nextTxMeta && this.generateTransaction(setupId, nextTxMeta, i.prover!.schnorrPublicKey, i.verifier!.schnorrPublicKey);

        const schnorrPrivateKey = (agentConf.keyPairs as any)[this.agentId].private;
        const { hash, signature, body: _ } = await pyMakeTransaction(
            transactionMeta.desc,
            schnorrPrivateKey,
            currentTx?.scripts!,
            previousTx?.controlBlocks!,
            nextTx?.taprootAddress!);

        const reply = new TxKeysMessage({
            setupId,
            agentId: this.agentId,
            transactionDescriptor: transactionMeta.desc,
            wotsPublicKeys: currentTx?.wotsPublicKeys,
            taproot: currentTx?.taprootAddress.toString('hex'),
            transactionSignature: signature,
            transactionHash: hash
        });
        ctx.send(reply);
    }

    // handlers

    // verifier receives start message, sends joins message

    public on_start(ctx: SimpleContext, message: StartMessage) {
        let i = this.getInstance(message.setupId);
        if (i) throw new Error('Setup instance already exists');
        i = new SetupInstance(message.setupId, AgentRoles.VERIFIER, {
            agentId: this.agentId,
            schnorrPublicKey: stringToBigint(this.schnorrPublicKey)
        });
        this.instances.set(message.setupId, i);

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
        if (!i) throw new Error('Setup instance not found');
        if (i.verifier) throw new Error('Verifier agent already registered');
        i.verifier = {
            agentId: message.agentId,
            schnorrPublicKey: stringToBigint(message.schnorrPublicKey)
        };
        const firstTxMeta = allTransactions[0];
        this.sendTxKeysMessage(ctx, message.setupId, firstTxMeta);
    }









    async sendTxCosignMessage(ctx: SimpleContext, setupId: string, transactionDesc: string, txInfo: TransactionInfo) {
        const i = this.getInstance(setupId);
        const currentTx = i.allTransactions.get(transactionDesc);
        const previousTx = i.allTransactions.get(getPrevTransactionDesc(transactionDesc));
        const nextTx = i.allTransactions.get(getNextTransactionDesc(transactionDesc));
        const schnorrPrivateKey = (agentConf.keyPairs as any)[this.agentId].private;
        const { hash, signature, body: _ } = await pyMakeTransaction(transactionDesc, schnorrPrivateKey, currentTx?.scripts!, previousTx?.controlBlocks!, nextTx?.taprootAddress!);
        const reply = new CosignTxMessage({
            setupId,
            agentId: this.agentId,
            transactionDescriptor: transactionDesc,
            transactionSignature: signature,
            transactionHash: hash
        });
        ctx.send(reply);
    }

    on_txKeys(ctx: SimpleContext, message: TxKeysMessage) {
        const i = this.getInstance(message.setupId);
        const creator = transactionCreators[message.transactionDescriptor as keyof typeof transactionCreators] as TransactionCreator;
        const initialTx = creator(i.agents[0].schnorrPublicKey, i.agents[1].schnorrPublicKey);
        this.sendTxCosignMessage(ctx, message.setupId, message.transactionDescriptor, initialTx);
    }
}

console.log('Starting...');

const agentId = process.argv[2] ?? 'bitsnark_prover_1';
const role = agentId.indexOf('prover') >= 0 ? AgentRoles.PROVER : AgentRoles.VERIFIER;

const agent = new Agent(agentId, role);
agent.launch().then(() => {
    console.log('Quitting...');
});
