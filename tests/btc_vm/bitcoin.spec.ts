import { nibblesToBigint_3, nibblesToBigint_4 } from '../../src/agent/final-step/nibbles';
import { toNibbles_4, WOTS_DATA_NIBBLES, WotsType } from '../../src/agent/common/winternitz';
import { Bitcoin } from '../../src/generator/btc_vm/bitcoin';

describe('SHA256 tests', function () {
    it('nibbles4To3', () => {
        const n = 123456789n;
        const bitcoin = new Bitcoin();

        const wn = toNibbles_4(n, WOTS_DATA_NIBBLES[WotsType._256_4]).map((t) => bitcoin.addWitness(t));

        const sanityResult = nibblesToBigint_4(wn);
        expect(sanityResult.toString()).toEqual(n.toString());

        bitcoin.throwOnFail = true;
        const rnsi = bitcoin.nibbles4To3(wn);
        const btcResult = nibblesToBigint_3(rnsi);

        expect(btcResult.toString()).toEqual(n.toString());
    });
});
