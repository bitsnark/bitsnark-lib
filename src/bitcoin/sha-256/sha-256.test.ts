import { assert } from "chai";
import { verifyHash } from "./sha-256";

try {
    const msg = prepareMsg('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopqp');
    const hash = 0x3234a5b08b1112a6cb90bf9920ca1863535c9380a65633e5442befda64f84a6fn;

    console.log('Hashing...');
    assert(verifyHash(msg, hash));

} catch (e) {
    console.error(e);
}
