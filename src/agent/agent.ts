import { fromJson, JoinMessage, Message, StartMessage, TxKeysMessage } from "./messages";
import { createInitialTx } from "./steps/initial";
import { telegramConf } from '../../agent.conf';
import { SimpleContext, TelegramBot } from "./telegram";

interface AgentInfo {
    agentId: string;
    schnorrPublicKey: string;
}

class SetupInstance {
    setupId: string;
    agents: AgentInfo[] = [];

    constructor(setupId: string) {
        this.setupId = setupId;
    }
}

export enum AgentRoles {
    PROVER,
    VERIFIER
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
        this.schnorrPublicKey = (telegramConf.keyPairs as any)[this.agentId].public;
        this.bot = new TelegramBot(agentId, this);
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
            const message = fromJson(JSON.parse(data));
            if (message.agentId == this.agentId) return;
            const f = (this as any)[`on_${message.messageType}`];
            if (!f) throw new Error('Invalid dispatch');
            f.apply(this, [ ctx, message ]);
        }
    }

    public start(ctx: SimpleContext, setupId: string) {
        const i = this.getOrCreateInstance(setupId);
        i.agents.push({
            agentId: this.agentId,
            schnorrPublicKey: this.schnorrPublicKey
        });
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
            schnorrPublicKey: message.schnorrPublicKey
        });
        const reply = new JoinMessage({
            setupId: message.setupId,
            agentId: this.agentId,
            schnorrPublicKey: this.schnorrPublicKey
        });
        ctx.send(reply);
    }

    on_join(ctx: SimpleContext, message: StartMessage) {
        const i = this.getInstance(message.setupId);
        if (i.agents.some(t => t.agentId == message.agentId)) throw new Error('Agent already registered');
        i.agents.push({
            agentId: message.agentId,
            schnorrPublicKey: message.schnorrPublicKey
        });
        if (i.agents.length == 2) {
            const initialTx = createInitialTx(i.agents.map(a => a.schnorrPublicKey));
            const reply = new TxKeysMessage({
                setupId: message.setupId,
                agentId: this.agentId,
                transactionDescs: '01_PAT_INITIAL',
                publicKeys: initialTx.publicKeys,
                taproot: initialTx.taproot
            });
            ctx.send(reply);
        }
    }
}

console.log('Starting...');

const agentId = process.argv[2];
const role = agentId.indexOf('prover') >= 0 ? AgentRoles.PROVER : AgentRoles.VERIFIER;

const agent = new Agent(agentId, role);
agent.launch().then(() => {
    console.log('Quitting...');
});
