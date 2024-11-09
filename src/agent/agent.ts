import { agentConf, ONE_BITCOIN } from "./agent.conf";
import { AgentRoles, FundingUtxo } from "./common";
import { stringToBigint } from "../encoding/encoding";
import { generateAllScripts } from "./generate-scripts";
import { addAmounts } from "./amounts";
import { DoneMessage, fromJson, JoinMessage, SignaturesMessage, StartMessage, TransactionsMessage } from "./messages";
import { SimpleContext, TelegramBot } from "./telegram";
import { getTransactionByName, initializeTransactions, mergeWots, Transaction } from "./transactions-new";
import { signTransactions } from "./sign-transactions";
import { verifySetup } from "./verify-setup";

interface AgentInfo {
    agentId: string;
    schnorrPublicKey: bigint;
}

enum SetupState {
    HELLO,
    TRANSACTIONS,
    SIGNATURES,
    DONE
}

class SetupInstance {
    setupId: string;
    state: SetupState = SetupState.HELLO;
    myRole: AgentRoles;
    prover?: AgentInfo;
    verifier?: AgentInfo;
    proverFundingUtxo?: FundingUtxo;
    payloadUtxo?: FundingUtxo;
    transactions?: Transaction[];

    constructor(setupId: string, myRole: AgentRoles, me: AgentInfo, proverFundingUtxo?: FundingUtxo, payloadUtxo?: FundingUtxo) {
        this.setupId = setupId;
        this.myRole = myRole;
        this.prover = myRole == AgentRoles.PROVER ? me : undefined;
        this.verifier = myRole == AgentRoles.VERIFIER ? me : undefined;
        this.proverFundingUtxo = proverFundingUtxo;
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

    public async messageReceived(data: string, ctx: SimpleContext) {
        const tokens = data.split(' ');
        if (this.role == AgentRoles.PROVER && tokens.length == 1 && tokens[0] == '/start') {

            const randomSetupId = '' + Math.random();

            this.start(ctx, randomSetupId, {
                txId: '000',
                outputIndex: 0,
                amount: ONE_BITCOIN,
                external: true
            }, {
                txId: '111',
                outputIndex: 0,
                amount: ONE_BITCOIN,
                external: true
            });

        } else if (data.trim().startsWith('{') && data.trim().endsWith('}')) {

            const message = fromJson(data);
            console.log('Message received: ', message);
            if (message.agentId == this.agentId) return;
            const f = (this as any)[`on_${message.messageType}`];
            if (!f) throw new Error('Invalid dispatch');
            try {
                await f.apply(this, [ctx, message]);
            } catch (e) {
                console.error(e);
            }
        }
    }

    /// PROTOCOL BEGINS

    // prover sends start message
    public async start(ctx: SimpleContext, setupId: string, payloadUtxo: FundingUtxo, proverUtxo: FundingUtxo) {

        if (this.role != AgentRoles.PROVER)
            throw new Error("I'm not a prover");

        const i = new SetupInstance(setupId, AgentRoles.PROVER, {
            agentId: this.agentId,
            schnorrPublicKey: stringToBigint(this.schnorrPublicKey)
        }, payloadUtxo, proverUtxo);
        this.instances.set(setupId, i);
        i.prover = {
            agentId: this.agentId,
            schnorrPublicKey: stringToBigint(this.schnorrPublicKey)
        };

        i.state = SetupState.HELLO;

        const msg = new StartMessage({
            setupId,
            agentId: this.agentId,
            schnorrPublicKey: this.schnorrPublicKey,
            payloadUtxo,
            proverUtxo
        });
        await ctx.send(msg);
    }

    // verifier receives start message, generates transactions, sends join message
    async on_start(ctx: SimpleContext, message: StartMessage) {
        let i = this.instances.get(message.setupId);
        if (i)
            throw new Error('Setup instance already exists');

        i = new SetupInstance(message.setupId, AgentRoles.VERIFIER, {
            agentId: this.agentId,
            schnorrPublicKey: stringToBigint(this.schnorrPublicKey),
        }, message.proverUtxo, message.payloadUtxo);
        i.prover = {
            agentId: message.agentId,
            schnorrPublicKey: stringToBigint(message.schnorrPublicKey)
        };
        this.instances.set(message.setupId, i);

        i.transactions = await initializeTransactions(
            this.agentId,
            AgentRoles.VERIFIER,
            i.setupId,
            i.prover!.schnorrPublicKey!,
            i.verifier!.schnorrPublicKey!,
            i.payloadUtxo!,
            i.proverFundingUtxo!);

        i.state = SetupState.TRANSACTIONS;

        const reply = new JoinMessage({
            setupId: message.setupId,
            agentId: this.agentId,
            schnorrPublicKey: this.schnorrPublicKey
        });
        await ctx.send(reply);
    }

    // prover receives join message, generates transactions
    async on_join(ctx: SimpleContext, message: StartMessage) {
        const i = this.getInstance(message.setupId);
        if (i.state != SetupState.HELLO)
            throw new Error('Invalid state');

        if (i.verifier)
            throw new Error('Verifier agent already registered');

        i.verifier = {
            agentId: message.agentId,
            schnorrPublicKey: stringToBigint(message.schnorrPublicKey)
        };

        i.transactions = await initializeTransactions(
            this.agentId,
            AgentRoles.PROVER,
            i.setupId,
            i.prover!.schnorrPublicKey!,
            i.verifier!.schnorrPublicKey!,
            i.payloadUtxo!,
            i.proverFundingUtxo!);

        i.state = SetupState.TRANSACTIONS;
        this.sendTransactions(ctx, i.setupId);
    }

    // prover sends transaction structure
    private async sendTransactions(ctx: SimpleContext, setupId: string) {
        const i = this.getInstance(setupId);

        const transactionsMessage = new TransactionsMessage({
            setupId,
            transactions: i.transactions,
            agentId: this.agentId,
        });
        await ctx.send(transactionsMessage);
    }

    // prover or verifier receives others's transactions
    async on_transactions(ctx: SimpleContext, message: TransactionsMessage) {
        const i = this.getInstance(message.setupId);
        if (i.state != SetupState.TRANSACTIONS)
            throw new Error('Invalid state');

        // make sure two arrays have same structure
        if (i.transactions!.some((t, tindex) => t.transactionName != message.transactions[tindex].transactionName))
            throw new Error('Incompatible');

        // copy their wots pubkeys to ours
        mergeWots(i.myRole, i.transactions!, message.transactions!);

        i.state = SetupState.SIGNATURES;

        if (this.role == AgentRoles.PROVER) {
            i.transactions = await generateAllScripts(this.agentId, i.setupId, this.role, i.transactions!);
            i.transactions = await addAmounts(this.agentId, this.role, i.setupId);
            this.sendSignatures(ctx, i.setupId);
        } else {
            await this.sendTransactions(ctx, i.setupId);
            i.transactions = await generateAllScripts(this.agentId, i.setupId, this.role, i.transactions!);
            i.transactions = await addAmounts(this.agentId, this.role, i.setupId);
        }
    }

    /// SIGNING PHASE

    // prover sends all of the signatures
    private async sendSignatures(ctx: SimpleContext, setupId: string) {
        const i = this.getInstance(setupId);

        i.transactions = await signTransactions(this.role, this.agentId, i.setupId, i.transactions!);

        const signed: any[] = i.transactions!.map(t => {
            return {
                transactionName: t.transactionName,
                txId: t.txId,
                signatures: t.inputs
                    .map(input => this.role == AgentRoles.PROVER ? input.proverSignature : input.verifierSignature)
            };
        });

        const signaturesMessage = new SignaturesMessage({
            setupId: i.setupId,
            signed
        });
        await ctx.send(signaturesMessage);
    }

    async on_signatures(ctx: SimpleContext, message: SignaturesMessage) {
        const i = this.getInstance(message.setupId);
        if (i.state != SetupState.SIGNATURES)
            throw new Error('Invalid state');

        i.state = SetupState.DONE;

        for (const s of message.signed) {
            const transaction = getTransactionByName(i.transactions!, s.transactionName);
            if (transaction.external) continue;
            transaction.inputs.forEach((input, inputIndex) => {
                if (!s.signatures[inputIndex]) return;
                if (this.role == AgentRoles.PROVER) {
                    input.verifierSignature = s.signatures[inputIndex];
                } else {
                    input.proverSignature = s.signatures[inputIndex];
                }
            });
        }

        if (this.role == AgentRoles.PROVER) {
            await verifySetup(this.agentId, i.setupId);
            await ctx.send(new DoneMessage({ setupId: i.setupId }));
        } else {
            await this.sendSignatures(ctx, i.setupId);
        }
    }

    async on_done(ctx: SimpleContext, message: SignaturesMessage) {
        const i = this.getInstance(message.setupId);
        if (i.state != SetupState.DONE)
            throw new Error('Invalid state');

        if (this.role == AgentRoles.VERIFIER) {
            await verifySetup(this.agentId, i.setupId);
            await ctx.send(new DoneMessage({ setupId: i.setupId }));
        }
    }
}

console.log('Starting');

const agentId = process.argv[2] ?? 'bitsnark_prover_1';
const role = agentId.indexOf('prover') >= 0 ? AgentRoles.PROVER : AgentRoles.VERIFIER;

const agent = new Agent(agentId, role);
agent.launch().then(() => {
    console.log('Quitting');
});
