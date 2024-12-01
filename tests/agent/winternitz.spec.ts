import { Bitcoin } from '../../src/generator/btc_vm/bitcoin';
import {
    decodeWinternitz,
    encodeWinternitz,
    getWinternitzPublicKeys,
    WOTS_DATA_NIBBLES,
    WotsType
} from '../../src/agent/common/winternitz';
import { StackItem } from '../../src/generator/btc_vm/stack';
import { nibblesToBigint_3 } from '../../src/agent/final-step/nibbles';

function bitcoinWinernitzCheck(wotsType: WotsType, encoded: Buffer[], keys: Buffer[]) {
    const bitcoin = new Bitcoin();
    bitcoin.throwOnFail = true;
    const witness = encoded.map((b) => bitcoin.newStackItem(b));
    const t = {
        [WotsType._1]: bitcoin.winternitzCheck1,
        [WotsType._24]: bitcoin.winternitzCheck24,
        [WotsType._256]: bitcoin.winternitzCheck256,
        [WotsType._256_4]: bitcoin.winternitzCheck256_4
    };
    t[wotsType].apply(bitcoin, [witness, keys]);
    expect(bitcoin.success).toBeTruthy();
}

function bitcoinWinernitzDecode(wotsType: WotsType, encoded: Buffer[], keys: Buffer[]) {
    const bitcoin = new Bitcoin();
    bitcoin.throwOnFail = true;
    const witness = encoded.map((b) => bitcoin.newStackItem(b));
    const target: StackItem[] = bitcoin.newNibbles(WOTS_DATA_NIBBLES[wotsType]);
    const t = {
        [WotsType._1]: bitcoin.winternitzDecode1,
        [WotsType._24]: bitcoin.winternitzDecode24,
        [WotsType._256]: bitcoin.winternitzDecode256,
        [WotsType._256_4]: bitcoin.winternitzDecode256_4
    };
    t[wotsType].apply(bitcoin, [target, witness, keys]);
    expect(bitcoin.success).toBeTruthy();
    return target;
}

function testWotsType(wotsType: WotsType) {
    describe('WotsType ' + wotsType, () => {
        const keys = getWinternitzPublicKeys(wotsType, '');
        const test1 = 1n;
        const encoded = encodeWinternitz(wotsType, test1, '');

        it('encode/decode', () => {
            const decoded = decodeWinternitz(wotsType, encoded, keys);
            expect(decoded).toEqual(test1);
        });

        it('bitcoin check', () => {
            bitcoinWinernitzCheck(wotsType, encoded, keys);
        });

        it('bitcoin decode', () => {
            const target = bitcoinWinernitzDecode(wotsType, encoded, keys);
            expect(nibblesToBigint_3(target)).toEqual(test1);
        });
    });
}

describe('Winternitz encoding', () => {
    testWotsType(WotsType._1);
    testWotsType(WotsType._24);
    testWotsType(WotsType._256);
    testWotsType(WotsType._256_4);
});
