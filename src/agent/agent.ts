import { agentConf } from "../../agent.conf";
import { AgentRoles, stringToBigint, TransactionInfo } from "./common";
import { CosignTxMessage, fromJson, JoinMessage, StartMessage, TxKeysMessage } from "./messages";
import { pyMakeTransaction } from "./py-client";
import { createInitialTx } from "./steps/initial";
import { SimpleContext, TelegramBot } from "./telegram";
import { getNextTransactionDesc, getPrevTransactionDesc, getTransactionsDescsForRole, TransactionCreator, transactionCreators, transactionDescs } from "./transactions";

interface AgentInfo {
    agentId: string;
    schnorrPublicKey: bigint;
}

class SetupInstance {
    setupId: string;
    agents: AgentInfo[] = [];
    allTransactions: Map<string, TransactionInfo> = new Map<string, TransactionInfo>();

    constructor(setupId: string) {
        this.setupId = setupId;
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

    private generateTransactions(setupId: string) {
        const i = this.getInstance(setupId);
        for (const txdesc of getTransactionsDescsForRole(this.role)) {
            const txinfo = transactionCreators[txdesc]!
                (i.agents[0].schnorrPublicKey, i.agents[1].schnorrPublicKey);
            i.allTransactions.set(txdesc, txinfo);
        }
    }

    async launch() {
        await this.bot.launch();
    }

    getInstance(setupId: string): SetupInstance {
        const i = this.instances.get(setupId);
        if (!i) throw new Error('Invalid instance');
        return i;
    }

    getOrCreateInstance(setupId: string): SetupInstance {
        let i = this.instances.get(setupId);
        if (!i) i = new SetupInstance(setupId);
        this.instances.set(setupId, i);
        return i;
    }

    messageReceived(data: string, ctx: SimpleContext): void {
        const tokens = data.split(' ');
        if (tokens.length == 2 && tokens[0] == '/start' && this.role == AgentRoles.PROVER) {

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
        const i = this.getOrCreateInstance(setupId);
        i.agents.push({
            agentId: this.agentId,
            schnorrPublicKey: stringToBigint(this.schnorrPublicKey)
        });

        this.generateTransactions(setupId);

        const msg = new StartMessage({
            setupId,
            agentId: this.agentId,
            schnorrPublicKey: this.schnorrPublicKey
        });
        ctx.send(msg);
    }

    on_start(ctx: SimpleContext, message: StartMessage) {
        const i = this.getOrCreateInstance(message.setupId);
        i.agents.push({
            agentId: message.agentId,
            schnorrPublicKey: stringToBigint(message.schnorrPublicKey)
        });

        this.generateTransactions(message.setupId);

        const reply = new JoinMessage({
            setupId: message.setupId,
            agentId: this.agentId,
            schnorrPublicKey: this.schnorrPublicKey
        });
        ctx.send(reply);
    }

    async sendTxKeysMessage(ctx: SimpleContext, setupId: string, transactionDesc: string) {
        const i = this.getInstance(setupId);
        const currentTx = i.allTransactions.get(transactionDesc);
        const previousTx = i.allTransactions.get(getPrevTransactionDesc(transactionDesc));
        const nextTx = i.allTransactions.get(getNextTransactionDesc(transactionDesc));
        const schnorrPrivateKey = (agentConf.keyPairs as any)[this.agentId].private;
        const { hash, signature, body: _ } = await pyMakeTransaction(transactionDesc, schnorrPrivateKey, currentTx?.scripts!, previousTx?.controlBlocks!, nextTx?.taprootAddress!);
        const reply = new TxKeysMessage({
            setupId,
            agentId: this.agentId,
            transactionDescriptor: transactionDesc,
            wotsPublicKeys: currentTx?.wotsPublicKeys,
            taproot: currentTx?.taprootAddress.toString('hex'),
            transactionSignature: signature,
            transactionHash: hash
        });
        ctx.send(reply);
    }

    on_join(ctx: SimpleContext, message: StartMessage) {
        const i = this.getInstance(message.setupId);
        if (i.agents.some(t => t.agentId == message.agentId)) throw new Error('Agent already registered');
        i.agents.push({
            agentId: message.agentId,
            schnorrPublicKey: stringToBigint(message.schnorrPublicKey)
        });
        if (i.agents.length == 2) {
            const firstTxDesc = transactionDescs[0];
            this.sendTxKeysMessage(ctx, message.setupId, firstTxDesc);
        }
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
