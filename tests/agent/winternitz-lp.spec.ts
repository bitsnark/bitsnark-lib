import { Bitcoin, executeProgram } from '../../src/generator/btc_vm/bitcoin';
import { bigintToNibbles_4 } from '../../src/agent/final-step/nibbles';
import {
    decodeWinternitzToBigint,
    encodeWinternitz,
    getWinternitzPublicKeys,
    WotsType
} from '../../src/agent/common/winternitz';

describe('Winternitz listpick4 variation', () => {
    it('encode - decode', () => {
        const data = 0x123456789abcdef1n;
        const witness: Buffer[] = encodeWinternitz(WotsType._256_4_LP, data, '');
        const publicKeys = getWinternitzPublicKeys(WotsType._256_4_LP, '');
        const result = decodeWinternitzToBigint(WotsType._256_4_LP, witness, publicKeys);
        expect(result).toBe(data);
    });

    it('bitcoin check - 256_4', () => {
        const data = 0x123456789abcdef1n;
        const witness: Buffer[] = encodeWinternitz(WotsType._256_4, data, '');
        const bitcoin = new Bitcoin();
        bitcoin.throwOnFail = true;

        const si = witness.map((b) => bitcoin.addWitness(b));
        const publicKeys = getWinternitzPublicKeys(WotsType._256_4, '');
        bitcoin.winternitzCheck256_4(si, publicKeys);

        let dataSize = 0;
        witness.forEach((b) => (dataSize += b.length));
        dataSize += bitcoin.programSizeInBitcoinBytes();

        console.log('256_4 script size: ', dataSize);

        expect(bitcoin.success).toBeTruthy();
    });

    it('bitcoin check - listpick', () => {
        const data = 0x123456789abcdef1n;
        const encoded: Buffer[] = encodeWinternitz(WotsType._256_4_LP, data, '');

        const bitcoin = new Bitcoin();
        bitcoin.throwOnFail = true;

        const witness = encoded.map((b) => bitcoin.addWitness(b));
        const publicKeys = getWinternitzPublicKeys(WotsType._256_4_LP, '');
        bitcoin.winternitzCheck256_listpick4(witness, publicKeys);
        bitcoin.drop(witness);

        let dataSize = 0;
        encoded.forEach((b) => (dataSize += b.length));
        dataSize += bitcoin.programSizeInBitcoinBytes();

        console.log('listpick script size: ', dataSize);

        expect(bitcoin.success).toBeTruthy();
    });

    it('bitcoin decode - listpick', () => {
        const data = 0x123456789abcdef1n;
        const encoded: Buffer[] = encodeWinternitz(WotsType._256_4_LP, data, '');

        const bitcoin = new Bitcoin();
        bitcoin.throwOnFail = true;

        const witness = encoded.map((b) => bitcoin.addWitness(b));
        const publicKeys = getWinternitzPublicKeys(WotsType._256_4_LP, '');
        const target = bitcoin.newNibbles(64);
        bitcoin.winternitzDecode256_listpick4(target, witness, publicKeys);
        expect(bitcoin.success).toBeTruthy();

        const nibbles = bigintToNibbles_4(data, 64);

        expect(target.map((si) => si.value)).toEqual(nibbles);
    });

    it('bitcoin check - listpick', () => {
        const data = 0x123456789abcdef1n;
        const encoded: Buffer[] = encodeWinternitz(WotsType._256_4_LP, data, '');

        const bitcoin = new Bitcoin();
        bitcoin.throwOnFail = true;
        const publicKeys = getWinternitzPublicKeys(WotsType._256_4_LP, '');
        const witness = [0, 1, 2, 3].map(() => encoded.map((b) => bitcoin.addWitness(b)));
        for (let i = 0; i < 2; i++) {
            bitcoin.addWitness(Buffer.from(new Array(64)));
            bitcoin.verifySignature(Buffer.alloc(32));
        }
        for (let i = 0; i < 4; i++) {
            bitcoin.winternitzCheck256_listpick4(witness[i], publicKeys);
            bitcoin.drop(witness[i]);
        }

        const script = bitcoin.programToBinary();
        const secondBitcoin = new Bitcoin();
        secondBitcoin.throwOnFail = true;
        for (let i = 0; i < 4; i++) {
            encoded.map((b) => secondBitcoin.addWitness(b));
        }
        for (let i = 0; i < 2; i++) {
            secondBitcoin.addWitness(Buffer.from(new Array(64)));
        }
        
        executeProgram(secondBitcoin, script, true);
        expect(secondBitcoin.success).toBeTruthy();
    });
});
