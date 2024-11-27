import { Context, NarrowedContext, Telegraf } from 'telegraf';
import { channelPost, message } from 'telegraf/filters';
import { agentConf } from '../agent.conf';
import axios from 'axios';
import { Update } from 'telegraf/types';
import { Message, toJson } from './messages';

type TelegrafContext = NarrowedContext<Context<Update>, Update.ChannelPostUpdate>;

export class SimpleContext {
    ctx: TelegrafContext;

    constructor(ctx: TelegrafContext) {
        this.ctx = ctx;
    }

    async send(data: Message) {
        const text = toJson(data);
        if (text.length < 10 * 1024) {
            await this.ctx.reply(text);
        } else {
            await this.ctx.sendDocument({
                source: Buffer.from(text, 'ascii'),
                filename: `${data.constructor.name}.txt`
            });
        }
    }
}

export abstract class ITelegramClient {
    abstract messageReceived(data: string, ctx: SimpleContext): void;
}

export class TelegramBot {
    agentId: string;
    token: string;
    bot: Telegraf;
    client: ITelegramClient;

    constructor(agentId: string, client: ITelegramClient) {
        this.agentId = agentId;
        this.token = agentConf.tokens[agentId];
        this.bot = new Telegraf(this.token);
        this.client = client;

        this.bot.on(message('text'), async (ctx) => {
            console.log(ctx.message.from.username, ctx.message.text);
        });

        this.bot.on(channelPost(), async (ctx) => {
            console.log(ctx.update.channel_post);
            const channelPost = ctx.update.channel_post;
            const text = 'text' in channelPost ? channelPost.text : undefined;
            const file = 'document' in channelPost ? channelPost.document : undefined;

            try {
                if (text) {
                    console.log('!!! text !!!', text);
                    this.client.messageReceived(text, new SimpleContext(ctx));
                } else if (file) {
                    ctx.telegram.getFileLink(file.file_id).then((url) => {
                        axios({ url: url.toString(), responseType: 'text' }).then((response) => {
                            console.log('!!! file !!!', response.data.length);
                            this.client.messageReceived(response.data, new SimpleContext(ctx));
                        });
                    });
                }
            } catch (e) {
                console.error(e);
            }
        });

        process.once('SIGINT', () => this.bot.stop('SIGINT'));
        process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
    }

    async launch() {
        await this.bot.launch();
    }
}
