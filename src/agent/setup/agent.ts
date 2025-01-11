import { bigintToString, stringToBigint } from '../common/encoding';
import { agentConf } from '../agent.conf';
import { generateAllScripts } from './generate-scripts';
import {
    DoneMessage,
    fromJson,
    JoinMessage,
    Message,
    SignaturesMessage,
    SignatureTuple,
    StartMessage,
    toJson,
    TransactionsMessage
} from './messages';
import { SimpleContext, TelegramBot } from './telegram';
import { verifySetup } from './verify-setup';
import { signMessage, verifyMessage } from '../common/schnorr';
import { addAmounts } from './amounts';
import { signTemplates, verifySignatures } from './sign-templates';
import { AgentRoles, Setup, SetupStatus, SignatureType, Template, TemplateNames } from '../common/types';
import { initializeTemplates } from './init-templates';
import { mergeWots, setWotsPublicKeysForArgument } from './wots-keys';
import { BitcoinNode } from '../common/bitcoin-node';
import { AgentDb, updateSetupPartial } from '../common/agent-db';
import { getSpendingConditionByInput, getTemplateByName } from '../common/templates';
import { transmitRawTransaction } from '../bitcoin/external-transactions';
import minimist from 'minimist';

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
    setup?: Setup;
    state: SetupState = SetupState.HELLO;
    myRole: AgentRoles;
    prover?: AgentInfo;
    verifier?: AgentInfo;
    templates?: Template[];

    constructor(setupId: string, setup: Setup, myRole: AgentRoles, me: AgentInfo) {
        this.setupId = setupId;
        this.setup = setup;
        this.myRole = myRole;
        this.prover = myRole == AgentRoles.PROVER ? me : undefined;
        this.verifier = myRole == AgentRoles.VERIFIER ? me : undefined;
    }
}

export class Agent {
    agentId: string;
    role: AgentRoles;
    instances: Map<string, SetupInstance> = new Map<string, SetupInstance>();
    schnorrPublicKey: string;
    bot: TelegramBot;
    bitcoinClient: BitcoinNode;
    db: AgentDb;

    constructor(agentId: string, role: AgentRoles) {
        this.agentId = agentId;
        this.role = role;
        this.schnorrPublicKey = agentConf.keyPairs[this.agentId].schnorrPublic;
        this.bot = new TelegramBot(agentId, this);
        this.bitcoinClient = new BitcoinNode();
        this.db = new AgentDb(this.agentId);
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
        if (!data) {
            console.log('The Nothing is here');
            return;
        }
        if (data.trim().startsWith('{') && data.trim().endsWith('}')) {
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

    public signMessage(message: Message): Message {
        const signature = signMessage(toJson(message), agentConf.keyPairs[this.agentId].schnorrPrivate);
        message.telegramMessageSig = signature;
        return message;
    }

    public async signMessageAndSend(context: SimpleContext | null, message: Message) {
        const signedMessage = this.signMessage(message);
        if (context) await context.send(signedMessage);
        else await this.bot.bot.telegram.sendMessage(agentConf.telegramChannelId, toJson(signedMessage));
    }

    public verifyMessage(message: Message, i: SetupInstance) {
        const otherPubKey = this.role == AgentRoles.PROVER ? i.verifier!.schnorrPublicKey : i.prover!.schnorrPublicKey;

        const verified = verifyMessage(
            toJson({ ...message, telegramMessageSig: '' }),
            message.telegramMessageSig,
            bigintToString(otherPubKey, 256)
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
    public async start(
        setupId: string,
        payloadTxid: string,
        payloadTx: string,
        payloadAmount: bigint,
        stakeTxid: string,
        stakeTx: string,
        stakeAmount: bigint
    ) {
        if (this.role != AgentRoles.PROVER) throw new Error("I'm not a prover");

        await this.db.createSetup(setupId);
        let setup = await this.db.getSetup(setupId);
        if (!setup || setup.status != SetupStatus.PENDING) throw new Error(`Invalid setup state: ${setup.status}`);

        setup = await this.db.updateSetup(setupId, {
            payloadTxid,
            payloadTx,
            payloadAmount,
            stakeTxid,
            stakeTx,
            stakeAmount,
            payloadOutputIndex: 1,
            stakeOutputIndex: 1
        });

        const i = new SetupInstance(setupId, setup, AgentRoles.PROVER, {
            agentId: this.agentId,
            schnorrPublicKey: stringToBigint(this.schnorrPublicKey)
        });
        this.instances.set(setupId, i);

        i.state = SetupState.HELLO;

        const msg = new StartMessage({
            setupId,
            agentId: this.agentId,
            payloadUtxo: { txid: payloadTxid, amount: payloadAmount, outputIndex: 0 },
            proverUtxo: { txid: stakeTxid, amount: stakeAmount, outputIndex: 0 },
            schnorrPublicKey: this.schnorrPublicKey
        });

        await this.signMessageAndSend(null, msg);
    }

    // verifier receives start message, generates templates, sends join message
    async on_start(context: SimpleContext, message: StartMessage) {
        let i = this.instances.get(message.setupId);
        if (i) throw new Error('Setup instance already exists');

        this.verifyPubKey((message as StartMessage).schnorrPublicKey, message.agentId);

        const setup = await this.db.createSetup(message.setupId);
        setup.payloadTxid = message.payloadUtxo!.txid;
        setup.payloadOutputIndex = message.payloadUtxo!.outputIndex;
        setup.payloadAmount = message.payloadUtxo!.amount;
        setup.stakeTxid = message.proverUtxo!.txid;
        setup.stakeOutputIndex = message.proverUtxo!.outputIndex;
        setup.stakeAmount = message.proverUtxo!.amount;
        await this.db.updateSetup(setup.id, setup as updateSetupPartial);

        i = new SetupInstance(message.setupId, setup, AgentRoles.VERIFIER, {
            agentId: this.agentId,
            schnorrPublicKey: stringToBigint(this.schnorrPublicKey)
        });

        i.prover = {
            agentId: message.agentId,
            schnorrPublicKey: stringToBigint(message.schnorrPublicKey)
        };

        this.instances.set(message.setupId, i);

        this.verifyMessage(message, i);

        i.templates = await initializeTemplates(
            AgentRoles.VERIFIER,
            i.setupId,
            i.prover!.schnorrPublicKey!,
            i.verifier!.schnorrPublicKey!,
            { txid: setup.payloadTxid, outputIndex: setup.payloadOutputIndex, amount: setup.payloadAmount },
            { txid: setup.stakeTxid, outputIndex: setup.stakeOutputIndex, amount: setup.stakeAmount }
        );

        i.state = SetupState.TRANSACTIONS;

        const reply = new JoinMessage({
            setupId: message.setupId,
            agentId: this.agentId,
            schnorrPublicKey: this.schnorrPublicKey
        });

        await this.signMessageAndSend(context, reply);
    }

    // prover receives join message, generates templates
    async on_join(context: SimpleContext, message: JoinMessage) {
        // let's see if the setup exists on my end
        const setup = await this.db.getSetup(message.setupId);
        if (!setup) {
            throw new Error("Setup doesn't exist");
        }

        let i = this.instances.get(setup.id);
        if (!i) {
            // this setup was probably created from the cli
            i = new SetupInstance(setup.id, setup, AgentRoles.PROVER, {
                agentId: this.agentId,
                schnorrPublicKey: stringToBigint(this.schnorrPublicKey)
            });
            this.instances.set(setup.id, i);
            i.state = SetupState.HELLO;
        }

        if (i.verifier) throw new Error('Verifier agent already registered');

        this.verifyPubKey(message.schnorrPublicKey, message.agentId);

        i.verifier = {
            agentId: message.agentId,
            schnorrPublicKey: stringToBigint(message.schnorrPublicKey)
        };

        this.verifyMessage(message, i);

        i.templates = await initializeTemplates(
            AgentRoles.PROVER,
            i.setupId,
            i.prover!.schnorrPublicKey!,
            i.verifier!.schnorrPublicKey!,
            { txid: setup.payloadTxid!, outputIndex: setup.payloadOutputIndex!, amount: setup.payloadAmount! },
            { txid: setup.stakeTxid!, outputIndex: setup.stakeOutputIndex!, amount: setup.stakeAmount! }
        );

        i.state = SetupState.TRANSACTIONS;
        this.sendTransactions(context, i.setupId);
    }

    // prover sends template structure
    private async sendTransactions(context: SimpleContext, setupId: string) {
        const i = this.getInstance(setupId);

        const transactionsMessage = TransactionsMessage.make(this.agentId, i.setupId, i.templates!);
        await this.signMessageAndSend(context, transactionsMessage);
    }

    // prover or verifier receives others's templates
    async on_transactions(context: SimpleContext, message: TransactionsMessage) {
        const i = this.getInstance(message.setupId);
        if (i.state != SetupState.TRANSACTIONS) throw new Error('Invalid state');

        // make sure two arrays have same structure
        if (i.templates!.some((t, tindex) => t.name != message.templates[tindex].name)) throw new Error('Incompatible');

        this.verifyMessage(message, i);

        // copy their wots pubkeys to ours
        i.templates = mergeWots(i.myRole, i.templates!, message.templates!);
        setWotsPublicKeysForArgument(i.setupId, i.templates!);

        i.state = SetupState.SIGNATURES;

        if (this.role == AgentRoles.VERIFIER) await this.sendTransactions(context, i.setupId);

        await this.db.upsertTemplates(i.setupId, i.templates!);

        i.templates = await generateAllScripts(this.agentId, i.setupId, this.role, i.templates!, true);
        i.templates = await addAmounts(this.agentId, this.role, i.setupId, i.templates!);

        await this.db.upsertTemplates(i.setupId, i.templates!);
        i.templates = await signTemplates(this.role, this.agentId, i.setupId, i.templates!);

        if (this.role == AgentRoles.PROVER) this.sendSignatures(context, i.setupId);
    }

    /// SIGNING PHASE

    // prover sends all of the signatures
    private async sendSignatures(context: SimpleContext, setupId: string) {
        const i = this.getInstance(setupId);
        if (!i.templates) throw new Error('No templates');

        const signed: SignatureTuple[] = i.templates!.map((t) => {
            return {
                templateName: t.name,
                txid: t.txid ?? '',
                signatures: t.inputs.map(
                    (input) => (this.role == AgentRoles.PROVER ? input.proverSignature : input.verifierSignature) ?? ''
                )
            };
        });

        const currentTip = await this.bitcoinClient.getBlockCount();
        await this.db.updateSetupLastCheckedBlockHeight(setupId, currentTip - 1);

        const signaturesMessage = new SignaturesMessage({
            setupId: i.setupId,
            signatures: signed
        });

        await this.signMessageAndSend(context, signaturesMessage);
    }

    async on_signatures(context: SimpleContext, message: SignaturesMessage) {
        const i = this.getInstance(message.setupId);
        if (i.state != SetupState.SIGNATURES) throw new Error('Invalid state');

        this.verifyMessage(message, i);

        await this.db.upsertTemplates(i.setupId, i.templates!);
        i.templates = await signTemplates(this.role, this.agentId, i.setupId, i.templates!);

        for (const s of message.signatures) {
            const template = getTemplateByName(i.templates!, s.templateName);
            if (template.isExternal) continue;
            template.inputs.forEach((input, inputIndex) => {
                if (!s.signatures[inputIndex]) return;
                if (this.role == AgentRoles.PROVER) {
                    input.verifierSignature = s.signatures[inputIndex];
                } else {
                    input.proverSignature = s.signatures[inputIndex];
                }
            });
        }

        console.log('Check that all inputs have signatures...');
        for (const template of i.templates!) {
            if (template.isExternal || template.name == TemplateNames.PROOF_REFUTED) {
                console.warn(`Not checking signatures for ${template.name}`);
                continue;
            }

            for (const input of template.inputs) {
                const sc = getSpendingConditionByInput(i.templates!, input);
                const proverRequired =
                    sc.signatureType === SignatureType.PROVER || sc.signatureType === SignatureType.BOTH;
                const verifierRequired =
                    sc.signatureType === SignatureType.VERIFIER || sc.signatureType === SignatureType.BOTH;
                if (!input.proverSignature && proverRequired) {
                    console.log(`Missing proverSignature for ${template.name} input ${input.index}`);
                }
                if (!input.verifierSignature && verifierRequired) {
                    console.log(`Missing verifierSignature for ${template.name} input ${input.index}`);
                }
            }
        }

        await this.db.updateTemplates(i.setupId, i.templates!);

        console.log('Verifying signatures...');
        await verifySignatures(this.agentId, i.setupId);

        if (this.role == AgentRoles.PROVER) {
            await verifySetup(this.agentId, i.setupId, this.role);

            await this.db.markSetupPegoutActive(i.setupId);
            await this.signMessageAndSend(context, new DoneMessage({ setupId: i.setupId, agentId: this.agentId }));
            i.state = SetupState.DONE;

            await this.sendExternalTransactions(i.setup!);
        } else {
            await this.sendSignatures(context, i.setupId);
            i.state = SetupState.DONE;
        }
    }

    async sendExternalTransactions(setup: Setup) {
        if (!setup.stakeTx) throw new Error('Missing prover stake tx');
        await transmitRawTransaction(setup.stakeTx);

        if (!setup.payloadTx) throw new Error('Missing locked funds tx');
        await transmitRawTransaction(setup.payloadTx);
    }

    async on_done(context: SimpleContext, message: SignaturesMessage) {
        const i = this.getInstance(message.setupId);
        if (i.state != SetupState.DONE) throw new Error('Invalid state');

        this.verifyMessage(message, i);

        if (this.role == AgentRoles.VERIFIER) {
            await verifySetup(this.agentId, i.setupId, this.role);
            await this.db.upsertTemplates(i.setupId, i.templates!);
            await this.db.markSetupPegoutActive(i.setupId);
            await this.signMessageAndSend(context, new DoneMessage({ setupId: i.setupId, agentId: this.agentId }));
        }
    }
}

if (require.main === module) {
    const args = minimist(process.argv.slice(2));
    const agentId = args['agent-id'] ?? args._[0] ?? 'bitsnark_prover_1';
    const role = agentId.indexOf('prover') >= 0 ? AgentRoles.PROVER : AgentRoles.VERIFIER;

    const agent = new Agent(agentId, role);
    console.log('Launching agent', agentId);
    agent.launch().then(() => {
        console.log('Quitting');
    });
}
