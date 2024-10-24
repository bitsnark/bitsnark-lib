import { afterEach, describe, expect, it } from "@jest/globals";

import * as fs from 'fs';

describe('AgentConfig', () => {

    it ("should use environment variables from .env.test when provided", () => {
        // Create a .env.test file, which precedes .env.local and .env
        fs.writeFileSync('.env.test', `
            INTERNAL_PUBKEY=2
            WOTS_SECRET=wots_secret
            TELEGRAM_TOKEN_PROVER=telegram_token_prover
            TELEGRAM_TOKEN_VERIFIER=telegram_token_verifier
            PROVER_SCHNORR_PUBLIC=prover_schnorr_public
            PROVER_SCHNORR_PRIVATE=prover_schnorr_private
            VERIFIER_SCHNORR_PUBLIC=verifier_schnorr_public
            VERIFIER_SCHNORR_PRIVATE=verifier_schnorr_private
        `);

        import('../../src/agent/agent.conf').then((conf) => {
            const agentConf = conf.agentConf;

            expect(agentConf.internalPubkey).toEqual(2n);
            expect(agentConf.winternitzSecret).toEqual('wots_secret');
            expect(agentConf.tokens['bitsnark_prover_1']).toEqual('telegram_token_prover');
            expect(agentConf.tokens['bitsnark_verifier_1']).toEqual('telegram_token_verifier');
            expect(agentConf.keyPairs['bitsnark_prover_1'].public).toEqual('prover_schnorr_public');
            expect(agentConf.keyPairs['bitsnark_prover_1'].private).toEqual('prover_schnorr_private');
            expect(agentConf.keyPairs['bitsnark_verifier_1'].public).toEqual('verifier_schnorr_public');
            expect(agentConf.keyPairs['bitsnark_verifier_1'].private).toEqual('verifier_schnorr_private');
        });
    });

    afterEach(() => {
        // Remove the .env.test file
        fs.unlinkSync('.env.test');
    });
});
