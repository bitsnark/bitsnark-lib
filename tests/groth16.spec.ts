import fs from 'fs';
import * as snarkjs from 'snarkjs';
import assert from "assert";
import groth16Verify, { Key, Proof } from '../src/generator/step1/verifier';
import { vm } from '../src/generator/step1/vm/vm';

const vkey_path = './tests/groth16/verification_key.json';

describe("groth16 verify", function () {

    let publicSignals: any = null;
    let badPublicSignals: any = null;
    let proof: any = null;
    let vKey: any;

    beforeAll(async () => {
        vKey = JSON.parse(fs.readFileSync(vkey_path).toString());

        proof = {
            "pi_a": ["4531350982720745483183896166010272188780196700199407980342269744581989148149",
                "8537072424426339037594105475681425616791387434880920465097584850313527560965",
                "1"],
            "pi_b": [
                ["2411699281801306923564935501152972918367713935498519592436730569804473762071",
                    "9802075445186058683936769178514143384687031267769197843391560534835079597863"],
                ["9841644077687891842107824701324051165061919977670341286300780240127706993433",
                    "542961677870429289316706958907664752199371035048761897149284127652926867503"],
                ["1", "0"]],
            "pi_c": ["3973245501156043393965035252994987222825469293526203824011347102421386558530",
                "5182492167196517803964084985226343839022108025654500361628202698319357889198",
                "1"],
            "protocol": "groth16",
            "curve": "bn128"
        };
        publicSignals = ["19820469076730107577691234630797803937210158605698999776717232705083708883456", "11"];
        badPublicSignals = JSON.parse(JSON.stringify(publicSignals));
        badPublicSignals[1]++;
    });

    it("sanity: snarkjs groth16 verify SUCCESS", async () => {
        const res = await snarkjs.groth16.verify(vKey, publicSignals, proof);
        assert(res == true);
    });

    it("sanity: snarkjs groth16 verify FAIL", async () => {
        const res = await snarkjs.groth16.verify(vKey, badPublicSignals, proof);
        assert(res == false);
    });

    it("groth16 verify SUCCESS", async () => {
        vm.reset();
        groth16Verify(new Key(vKey), Proof.fromSnarkjs(proof, publicSignals));
        assert(vm.success == true);
    });

    it("groth16 verify FAIL", async () => {
        vm.reset();
        groth16Verify(new Key(vKey), Proof.fromSnarkjs(proof, badPublicSignals));
        assert(vm.success == false);
    });
});
