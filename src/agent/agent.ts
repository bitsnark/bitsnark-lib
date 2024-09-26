import { agentConf, ONE_BITCOIN } from "../../agent.conf";
import { AgentRoles, FundingUtxo, stringToBigint, TransactionInfo } from "./common";
import { generateAllScripts } from "./generate-scripts";
import { DoneMessage, fromJson, JoinMessage, SignaturesMessage, StartMessage, TransactionsMessage, TxKeys, TxKeysMessage } from "./messages";
import { SimpleContext, TelegramBot } from "./telegram";
import { getTransactionByName, getTransactionFileNames, initializeTransactions, loadTransactionFromFile, Transaction, writeTransactionToFile } from "./transactions-new";

interface AgentInfo {
    agentId: string;
    schnorrPublicKey: bigint;
}

class SetupInstance {
    setupId: string;
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

    public messageReceived(data: string, ctx: SimpleContext): void {
        const tokens = data.split(' ');
        if (this.role == AgentRoles.PROVER && tokens.length == 1 && tokens[0] == '/start') {

            const randomSetupId = '' + Math.random();

            this.start(ctx, randomSetupId, {
                txId: '000',
                outputIndex: 0,
                amount: ONE_BITCOIN
            }, {
                txId: '111',
                outputIndex: 0,
                amount: ONE_BITCOIN
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

    /// PROTOCOL BEGINS

    // prover sends start message
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
            schnorrPublicKey: this.schnorrPublicKey,
            payloadUtxo,
            proverUtxo
        });
        ctx.send(msg);
    }

    // verifier receives start message, generates transactions, sends join message
    on_start(ctx: SimpleContext, message: StartMessage) {
        let i = this.instances.get(message.setupId);
        if (i) throw new Error('Setup instance already exists');
        i = new SetupInstance(message.setupId, AgentRoles.VERIFIER, {
            agentId: this.agentId,
            schnorrPublicKey: stringToBigint(this.schnorrPublicKey),
        }, message.proverUtxo, message.payloadUtxo);
        i.prover = {
            agentId: message.agentId,
            schnorrPublicKey: stringToBigint(message.schnorrPublicKey)
        };
        this.instances.set(message.setupId, i);

        i.transactions = initializeTransactions(
            AgentRoles.VERIFIER, 
            message.setupId, 
            i.prover?.schnorrPublicKey, 
            i.verifier!.schnorrPublicKey, 
            i.payloadUtxo!, 
            i.proverFundingUtxo!);

        const reply = new JoinMessage({
            setupId: message.setupId,
            agentId: this.agentId,
            schnorrPublicKey: this.schnorrPublicKey
        });
        ctx.send(reply);
    }

    // prover receives join message, generates transactions
    on_join(ctx: SimpleContext, message: StartMessage) {
        const i = this.getInstance(message.setupId);

        if (i.verifier) throw new Error('Verifier agent already registered');
        i.verifier = {
            agentId: message.agentId,
            schnorrPublicKey: stringToBigint(message.schnorrPublicKey)
        };

        i.transactions = initializeTransactions(
            AgentRoles.PROVER, 
            message.setupId, 
            i.prover?.schnorrPublicKey!, 
            i.verifier.schnorrPublicKey!, 
            i.payloadUtxo!, 
            i.proverFundingUtxo!);

        this.sendTransactions(ctx, i.setupId);
    }

    // prover sends transaction structure
    private sendTransactions(ctx: SimpleContext, setupId: string) {
        const i = this.getInstance(setupId);

        const filenames = getTransactionFileNames(setupId);
        const transactions = filenames.map(filename => loadTransactionFromFile(setupId, filename))
        .filter(t => t.role == this.role);
        const transactionsMessage = new TransactionsMessage({
            setupId,
            transactions,
            agentId: this.agentId,
        });
        ctx.send(transactionsMessage);
    }

    // prover or verifier receives others's transactions
    on_transactions(ctx: SimpleContext, message: TransactionsMessage) {
        const i = this.getInstance(message.setupId);

        if (this.role == AgentRoles.PROVER) {
            this.sendWotsKeys(ctx, i.setupId);
        } else {
            this.sendTransactions(ctx, i.setupId);
        }
    }

    /// Exchange WOTS keys
    private sendWotsKeys(ctx: SimpleContext, setupId: string) {
        const i = this.getInstance(setupId);

        const txKeys: TxKeys[] = [];
        i.transactions?.forEach((transaction, tIndex) => {
            const t: Buffer[][][][] = [];
            transaction.outputs.forEach((output, outputIndex) => {
                const tt: Buffer[][][] = [];
                output.spendingConditions.forEach((sc, scIndex) => {
                    if (sc.wotsPublicKeys) tt.push(sc.wotsPublicKeys);
                });
                if (tt.length) t.push(tt);
            });
            if (t.length) txKeys.push({
                transactionName: transaction.transactionName,
                wotsKeys: t
            });
        });

        const txKeysMessage = new TxKeysMessage({
            setupId,
            txKeys,
            agentId: this.agentId,
        });
        ctx.send(txKeysMessage);
    }

    // prover or verifier receive tx keys
    on_keys(ctx: SimpleContext, message: TxKeysMessage) {
        const i = this.getInstance(message.setupId);

        message.txKeys.forEach(txKey => {
            const transaction = getTransactionByName(i.transactions!, txKey.transactionName);
            transaction.outputs.forEach((output, outputIndex) => {
                output.spendingConditions.forEach((sc, scIndex) => {
                    if (sc.wotsSpec && !sc.wotsPublicKeys) {
                        sc.wotsPublicKeys = txKey.wotsKeys[outputIndex][scIndex];
                    }
                });
            });
            writeTransactionToFile(i.setupId, transaction);
        });

        if (this.role == AgentRoles.PROVER) {
            this.sendSignatures(ctx, i.setupId);
        } else {
            this.sendWotsKeys(ctx, i.setupId);
        }
    }

    /// SIGNING PHASE

    // prover sends all of the signatures
    private sendSignatures(ctx: SimpleContext, setupId: string) {
        const i = this.getInstance(setupId);

        generateAllScripts(i.setupId, i.transactions!);

        const signed: any[] = i.transactions!.map(t => {
            return {
                transactionName: t.transactionName,
                txId: '' + Math.random,
                signature:'' + Math.random,
            };
        });

        const signaturesMessage = new SignaturesMessage({
            setupId: i.setupId,
            signed      
        });
        ctx.send(signaturesMessage);
    }

    on_signatures(ctx: SimpleContext, message: SignaturesMessage) {
        const i = this.getInstance(message.setupId);

        if (this.role == AgentRoles.PROVER) {

            ctx.send(new DoneMessage({ setupId: i.setupId }));

        } else {

            this.sendSignatures(ctx, i.setupId);

        }
    }

    on_done(ctx: SimpleContext, message: SignaturesMessage) {
        const i = this.getInstance(message.setupId);

        if (this.role == AgentRoles.PROVER) {
        } else {

            ctx.send(new DoneMessage({ setupId: i.setupId }));

        }
    }
}

console.log('Starting...');

const agentId = process.argv[2] ?? 'bitsnark_verifier_1';
const role = agentId.indexOf('prover') >= 0 ? AgentRoles.PROVER : AgentRoles.VERIFIER;

const agent = new Agent(agentId, role);
agent.launch().then(() => {
    console.log('Quitting...');
});
