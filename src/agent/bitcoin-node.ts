const Client = require('bitcoin-core');
import { agentConf } from "./agent.conf";

export class BitcoinNode {
    public client

    constructor() {
        this.client = new Client({
            network: agentConf.bitcoinNodeNetwork,
            username: agentConf.bitcoinNodeUsername,
            password: agentConf.bitcoinNodePassword,
            host: agentConf.bitcoinNodeHost,
            port: agentConf.bitcoinNodePort

        })
    }
}
