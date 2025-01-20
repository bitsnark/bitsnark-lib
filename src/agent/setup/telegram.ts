import axios from 'axios';
import { Context, NarrowedContext, Telegraf } from 'telegraf';
import { channelPost } from 'telegraf/filters';
import { agentConf } from '../agent.conf';
import { Update } from 'telegraf/types';
import { Message, toJson } from './messages';

export type TelegrafContext = NarrowedContext<Context<Update>, Update.ChannelPostUpdate>;
const TELEGRAM_MAX_TEXT_MSG_LENGTH = 4096;

export class SimpleContext {
    context: TelegrafContext;

    constructor(context: TelegrafContext) {
        this.context = context;
    }

    async sendText(text: string) {
        await this.context.reply(text);
    }

    async send(data: Message) {
        const text = toJson(data);
        if (text.length < TELEGRAM_MAX_TEXT_MSG_LENGTH) {
            await this.context.reply(text);
        } else {
            await this.context.sendDocument({
                source: Buffer.from(text, 'ascii'),
                filename: `${data.constructor.name}.txt`
            });
        }
    }
}

export abstract class ITelegramClient {
    abstract messageReceived(data: string, context: SimpleContext): void;
}

export class TelegramBot {
    agentId: string;
    token: string;
    bot: Telegraf;
    client?: ITelegramClient;

    constructor(agentId: string, client?: ITelegramClient) {
        this.agentId = agentId;
        this.token = agentConf.tokens[agentId];
        this.bot = new Telegraf(this.token);
        this.client = client;

        this.bot.on(channelPost(), async (context) => {
            const channelPost = context.update.channel_post;

            if (!this.client) return;

            const text = 'text' in channelPost ? channelPost.text : undefined;
            const file = 'document' in channelPost ? channelPost.document : undefined;

            try {
                if (text) {
                    this.client!.messageReceived(text, new SimpleContext(context));
                } else if (file) {
                    context.telegram.getFileLink(file.file_id).then((url) => {
                        axios({ url: url.toString(), responseType: 'text' }).then((response) => {
                            this.client!.messageReceived(response.data, new SimpleContext(context));
                        }).catch((error) => {
                            console.error('Error fetching file content:', error);
                        });
                    }).catch((error) => {
                        console.error('Error getting file link:', error);
                    });
                }
            } catch (e) {
                console.error(e);
            }
        });

        process.once('SIGINT', () => this.bot.stop('SIGINT'));
        process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
    }

    async launch(fn?: () => void) {
        await this.bot.launch(fn);
    }
}
