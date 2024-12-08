import { TelegramBot } from './telegram';
import { Context, NarrowedContext, Telegraf } from 'telegraf';

async function main() {
    const [agentId, setupId, payloadTxid, payloadAmount, stakeTxid, stakeAmount] = process.argv.slice(2);

    const telegram = new TelegramBot(agentId ?? 'bitsnark_prover_1');
    telegram.bot.use((a) => console.log(a));
    await telegram.launch();
    console.log('Sending...');
}

if (require.main === module) {
    main().catch((error) => {
        throw error;
    });
}
