
import { Context, NarrowedContext, Telegraf } from 'telegraf';
import { channelPost, message } from 'telegraf/filters';
import { telegramConf } from '../../agent.conf';
import { fromJson } from './messages';
import axios from 'axios';
import { Message, Update } from 'telegraf/typings/core/types/typegram';
import { KeyedDistinct } from 'telegraf/typings/core/helpers/util';

type TelegrafContext = NarrowedContext<Context<Update>, Update.ChannelPostUpdate<KeyedDistinct<Message, never>>>;

export class SimpleContext {
    ctx: TelegrafContext;

    constructor(ctx: TelegrafContext) {
        this.ctx = ctx;
    }

    send(data: any) {
        const text = typeof(data) == 'string' ? data : JSON.stringify(data);
        if (text.length < 10 * 1024) {
            this.ctx.reply(text);
        } else {
            this.ctx.sendDocument({ source: Buffer.from(text, 'ascii') });
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
        this.token = (telegramConf.tokens as any)[agentId];
        this.bot = new Telegraf(this.token);
        this.client = client;

        this.bot.on(message('text'), async (ctx) => {
            console.log(ctx.message.from.username, ctx.message.text);
        });

        this.bot.on(channelPost(), async (ctx) => {
            console.log(ctx.update.channel_post);
            const text = (ctx.update.channel_post as any).text as string;
            const file = (ctx.update.channel_post as any).document;
            try {
                if (text) {
                    console.log('!!! text !!!', text);
                    this.client.messageReceived(text, new SimpleContext(ctx));
                } else if (file) {
                    ctx.telegram.getFileLink(file.file_id)
                        .then(url => {
                            axios({ url: url.toString(), responseType: 'text' }).then(response => {
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
