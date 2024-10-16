import { agentConf } from "./agent.conf";
//import cannot find module 'bitcoin-core'
const Client = require('bitcoin-core');

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
