import minimist from 'minimist';
import { ProtocolProver } from './protocol-prover';
import { proofBigint } from '../common/constants';

async function main(agentId: string, setupId: string, fudge: boolean = false) {
    const protocol = new ProtocolProver(agentId, setupId);
    const proof = [...proofBigint];
    if (fudge) {
        proof[0] = proof[0] + 1n;
    }
    await protocol.pegOut(proof);
}

if (require.main === module) {
    const args = minimist(process.argv.slice(2));
    const agentId = args._[0] ?? args['agent-id'] ?? 'bitsnark_prover_1';
    const setupId = args._[1] ?? args['setup-id'] ?? 'test_setup';
    const fudge = args.fudge ?? false;
    main(agentId, setupId, fudge).catch((error) => {
        throw error;
    });
}
