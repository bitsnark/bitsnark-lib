import { bigintToString, stringToBigint } from '../common/encoding';
import { agentConf } from '../agent.conf';
import { generateAllScripts } from './generate-scripts';
import {
    DoneMessage,
    fromJson,
    JoinMessage,
    Message,
    SignaturesMessage,
    Signed,
    StartMessage,
    toJson,
    TransactionsMessage
} from './messages';
import { SimpleContext, TelegramBot } from './telegram';
import { getTransactionByName, Transaction } from '../common/transactions';
import { verifySetup } from './verify-setup';
import { signMessage, verifyMessage } from '../common/schnorr';
import { addAmounts } from './amounts';
import { signTransactions } from './sign-transactions';
import { AgentRoles, FundingUtxo } from '../common/types';
import { initializeTemplates } from './init-templates';
import { mergeWots, setWotsPublicKeysForArgument } from './wots-keys';
import {
    readSetup,
    SetupStatus,
    updatedListenerHeightBySetupsIds,
    writeSetupStatus,
    writeTemplates
} from '../common/db';
import { BitcoinNode } from '../common/bitcoin-node';

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
    wotsSalt?: string;
    state: SetupState = SetupState.HELLO;
    myRole: AgentRoles;
    prover?: AgentInfo;
    verifier?: AgentInfo;
    proverFundingUtxo?: FundingUtxo;
    payloadUtxo?: FundingUtxo;
    transactions?: Transaction[];

    constructor(
        setupId: string,
        wotsSalt: string,
        myRole: AgentRoles,
        me: AgentInfo,
        proverFundingUtxo?: FundingUtxo,
        payloadUtxo?: FundingUtxo
    ) {
        this.setupId = setupId;
        this.wotsSalt = wotsSalt;
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
    bitcoinClient: BitcoinNode;

    constructor(agentId: string, role: AgentRoles) {
        this.agentId = agentId;
        this.role = role;
        this.schnorrPublicKey = agentConf.keyPairs[this.agentId].schnorrPublic;
        this.bot = new TelegramBot(agentId, this);
        this.bitcoinClient = new BitcoinNode();
    }

    async launch() {
        await this.bot.launch();
    }

    private getInstance(setupId: string): SetupInstance {
        const i = this.instances.get(setupId);
        if (!i) throw new Error('Invalid instance');
        return i;
    }

    public async messageReceived(data: string, context: SimpleContext) {
        const tokens = data.split(' ');
        if (this.role == AgentRoles.PROVER && tokens.length == 1 && tokens[0] == '/start') {
            const randomSetupId = Math.random().toString().slice(2);
            this.start(
                context,
                randomSetupId,
                {
                    txId: '0000000000000000000000000000000000000000000000000000000000000000',
                    outputIndex: 0,
                    amount: agentConf.payloadAmount,
                    external: true
                },
                {
                    txId: '1111111111111111111111111111111111111111111111111111111111111111',
                    outputIndex: 0,
                    amount: agentConf.proverStakeAmount,
                    external: true
                }
            );
        } else if (data.trim().startsWith('{') && data.trim().endsWith('}')) {
            const message = fromJson(data);
            console.log('Message received: ', message);
            if (message.agentId == this.agentId) return;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const f = (this as any)[`on_${message.messageType}`];
            if (!f) throw new Error('Invalid dispatch');

            try {
                await f.apply(this, [context, message]);
            } catch (e) {
                console.error(e);
            }
        }
    }

    public signMessage(context: SimpleContext, message: Message): Message {
        const signature = signMessage(toJson(message), agentConf.keyPairs[this.agentId].schnorrPrivate);
        message.telegramMessageSig = signature;
        return message;
    }

    public signMessageAndSend(context: SimpleContext, message: Message) {
        const signedMessage = this.signMessage(context, message);
        context.send(signedMessage);
    }

    public verifyMessage(message: Message, i: SetupInstance) {
        const otherPubKey = this.role == AgentRoles.PROVER ? i.verifier!.schnorrPublicKey : i.prover!.schnorrPublicKey;

        const verified = verifyMessage(
            toJson({ ...message, telegramMessageSig: '' }),
            message.telegramMessageSig,
            bigintToString(otherPubKey)
        );
        if (!verified) throw new Error('Invalid signature');
        console.log('Message signature verified');
    }

    private verifyPubKey(senderPubKey: string, senderAgentId: string): boolean {
        // Temporary solution - will be replaced with a proper verification against the contract
        const verifiedPubKey = agentConf.keyPairs[senderAgentId].schnorrPublic;
        if (verifiedPubKey != senderPubKey) throw new Error('Invalid public key');
        console.log('Public key is valid');
        return true;
    }

    /// PROTOCOL BEGINS
    // prover sends start message
    public async start(context: SimpleContext, setupId: string, payloadUtxo: FundingUtxo, proverUtxo: FundingUtxo) {
        if (this.role != AgentRoles.PROVER) throw new Error("I'm not a prover");

        const setup = await readSetup(setupId);

        const i = new SetupInstance(
            setupId,
            setup.wotsSalt,
            AgentRoles.PROVER,
            {
                agentId: this.agentId,
                schnorrPublicKey: stringToBigint(this.schnorrPublicKey)
            },
            payloadUtxo,
            proverUtxo
        );
        this.instances.set(setupId, i);

        i.state = SetupState.HELLO;

        const msg = new StartMessage({
            setupId,
            agentId: this.agentId,
            schnorrPublicKey: this.schnorrPublicKey,
            payloadUtxo,
            proverUtxo
        });

        await this.signMessageAndSend(context, msg);
    }

    // verifier receives start message, generates transactions, sends join message
    async on_start(context: SimpleContext, message: StartMessage) {
        let i = this.instances.get(message.setupId);
        if (i) throw new Error('Setup instance already exists');

        this.verifyPubKey((message as StartMessage).schnorrPublicKey, message.agentId);

        const setup = await readSetup(message.setupId);

        i = new SetupInstance(
            message.setupId,
            setup.wotsSalt,
            AgentRoles.VERIFIER,
            {
                agentId: this.agentId,
                schnorrPublicKey: stringToBigint(this.schnorrPublicKey)
            },
            message.proverUtxo,
            message.payloadUtxo
        );

        i.prover = {
            agentId: message.agentId,
            schnorrPublicKey: stringToBigint(message.schnorrPublicKey)
        };

        this.instances.set(message.setupId, i);

        this.verifyMessage(message, i);

        i.transactions = await initializeTemplates(
            this.agentId,
            AgentRoles.VERIFIER,
            i.setupId,
            i.prover!.schnorrPublicKey!,
            i.verifier!.schnorrPublicKey!,
            i.payloadUtxo!,
            i.proverFundingUtxo!
        );

        i.state = SetupState.TRANSACTIONS;

        const reply = new JoinMessage({
            setupId: message.setupId,
            agentId: this.agentId,
            schnorrPublicKey: this.schnorrPublicKey
        });

        await this.signMessageAndSend(context, reply);
    }

    // prover receives join message, generates transactions
    async on_join(context: SimpleContext, message: JoinMessage) {
        const i = this.getInstance(message.setupId);
        if (i.state != SetupState.HELLO) throw new Error('Invalid state');

        if (i.verifier) throw new Error('Verifier agent already registered');

        this.verifyPubKey(message.schnorrPublicKey, message.agentId);

        i.verifier = {
            agentId: message.agentId,
            schnorrPublicKey: stringToBigint(message.schnorrPublicKey)
        };

        this.verifyMessage(message, i);

        i.transactions = await initializeTemplates(
            this.agentId,
            AgentRoles.PROVER,
            i.setupId,
            i.prover!.schnorrPublicKey!,
            i.verifier!.schnorrPublicKey!,
            i.payloadUtxo!,
            i.proverFundingUtxo!
        );

        i.state = SetupState.TRANSACTIONS;
        this.sendTransactions(context, i.setupId);
    }

    // prover sends transaction structure
    private async sendTransactions(context: SimpleContext, setupId: string) {
        const i = this.getInstance(setupId);

        const transactionsMessage = TransactionsMessage.make(this.agentId, i.setupId, i.transactions!);
        await this.signMessageAndSend(context, transactionsMessage);
    }

    // prover or verifier receives others's transactions
    async on_transactions(context: SimpleContext, message: TransactionsMessage) {
        const i = this.getInstance(message.setupId);
        if (i.state != SetupState.TRANSACTIONS) throw new Error('Invalid state');

        // make sure two arrays have same structure
        if (i.transactions!.some((t, tindex) => t.transactionName != message.transactions[tindex].transactionName))
            throw new Error('Incompatible');

        this.verifyMessage(message, i);

        // copy their wots pubkeys to ours
        i.transactions = mergeWots(i.myRole, i.transactions!, message.transactions!);
        setWotsPublicKeysForArgument(i.setupId, i.transactions!);

        i.state = SetupState.SIGNATURES;

        if (this.role == AgentRoles.VERIFIER) await this.sendTransactions(context, i.setupId);

        i.transactions = await generateAllScripts(this.role, i.transactions!, false);
        i.transactions = await addAmounts(this.agentId, this.role, i.setupId, i.transactions!);

        if (this.role == AgentRoles.PROVER) this.sendSignatures(context, i.setupId);
    }

    /// SIGNING PHASE

    // prover sends all of the signatures
    private async sendSignatures(context: SimpleContext, setupId: string) {
        const i = this.getInstance(setupId);
        if (!i.transactions) throw new Error('No transactions');

        await writeSetupStatus(setupId, SetupStatus.PENDING);
        await writeTemplates(this.agentId, setupId, i.transactions);

        i.transactions = await signTransactions(this.role, this.agentId, i.setupId, i.transactions!);

        const signed: Signed[] = i.transactions!.map((t) => {
            return {
                transactionName: t.transactionName,
                txId: t.txId ?? '',
                signatures: t.inputs.map(
                    (input) => (this.role == AgentRoles.PROVER ? input.proverSignature : input.verifierSignature) ?? ''
                )
            };
        });

        const currentTip = await this.bitcoinClient.getBlockCount();
        updatedListenerHeightBySetupsIds([i.setupId], currentTip - 1);

        const signaturesMessage = new SignaturesMessage({
            setupId: i.setupId,
            signed
        });

        await this.signMessageAndSend(context, signaturesMessage);
    }

    async on_signatures(context: SimpleContext, message: SignaturesMessage) {
        const i = this.getInstance(message.setupId);
        if (i.state != SetupState.SIGNATURES) throw new Error('Invalid state');

        this.verifyMessage(message, i);

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
            await verifySetup(this.agentId, i.setupId, this.role);
            await this.signMessageAndSend(context, new DoneMessage({ setupId: i.setupId, agentId: this.agentId }));
        } else {
            await this.sendSignatures(context, i.setupId);
        }
    }

    async on_done(context: SimpleContext, message: SignaturesMessage) {
        const i = this.getInstance(message.setupId);
        if (i.state != SetupState.DONE) throw new Error('Invalid state');

        this.verifyMessage(message, i);

        if (this.role == AgentRoles.VERIFIER) {
            await verifySetup(this.agentId, i.setupId, this.role);
            await this.signMessageAndSend(context, new DoneMessage({ setupId: i.setupId, agentId: this.agentId }));
        }
    }
}

if (__filename == process.argv[1]) {
    console.log('Starting');

    const agentId = process.argv[2] ?? 'bitsnark_prover_1';
    const role = agentId.indexOf('prover') >= 0 ? AgentRoles.PROVER : AgentRoles.VERIFIER;

    const agent = new Agent(agentId, role);
    agent.launch().then(() => {
        console.log('Quitting');
    });
}
