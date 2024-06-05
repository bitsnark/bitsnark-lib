import fs from 'fs';
import * as snarkjs from 'snarkjs';
import assert from "assert";
import groth16Verify, { Key, Proof } from '../src/generator/step1/verifier';
import { vm } from '../src/generator/step1/vm/vm';
import { G3 } from '../src/generator/step1/algebra/G3';

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

    it("Check one pairing (alpha, beta)", () => {

        vKey = JSON.parse(fs.readFileSync(vkey_path).toString());
        const key = Key.fromSnarkjs(vKey);

        const g3 = new G3();
        const p = g3.optimalAte(key.alpha, key.beta);

        console.log(p);

        const expected = [[
            [16797326005963908962098276484654221056872758021366746390190852744159665755720n, 16055968598965938883115715560152175390953998245813339529835389779027155204272n],
            [11711069438761541037587481620064559438146059551762230919446170225763546295481n, 18373974391888105814979416238875552618141149713133703920153237123069049125784n],
            [6713314551825505084340027817664018738677721208187450717660564140931109259027n, 15886336566886560617571091626554087324882320626514349628775484758627537318741n]
        ], [
            [14297163314981939937007365486055215162457468895739693654582733058319112095235n, 1838092481036103079257482963404115008929191253027194230504243094095684917985n],
            [4917863492891291306193911177385837917727010947413841468042435732752003713138n, 13679180689896327378119277057153014080634765603550136003418182493665571968407n],
            [2802203472068284151141749053953489442658631765147754356144998749360718868736n, 274061167388041299793858878643017699571084719705275048644026531606121359281n]
        ]];

        // p.x
        expect(p.x.x.x.register.value.toString()).toBe(expected[0][0][0].toString());
        expect(p.x.x.y.register.value.toString()).toBe(expected[0][0][1].toString());
        expect(p.x.y.x.register.value.toString()).toBe(expected[0][1][0].toString());
        expect(p.x.y.y.register.value.toString()).toBe(expected[0][1][1].toString());
        expect(p.x.z.x.register.value.toString()).toBe(expected[0][2][0].toString());
        expect(p.x.z.y.register.value.toString()).toBe(expected[0][2][1].toString());
        // p.y
        expect(p.y.x.x.register.value.toString()).toBe(expected[1][0][0].toString());
        expect(p.y.x.y.register.value.toString()).toBe(expected[1][0][1].toString());
        expect(p.y.y.x.register.value.toString()).toBe(expected[1][1][0].toString());
        expect(p.y.y.y.register.value.toString()).toBe(expected[1][1][1].toString());
        expect(p.y.z.x.register.value.toString()).toBe(expected[1][2][0].toString());
        expect(p.y.z.y.register.value.toString()).toBe(expected[1][2][1].toString());
    });

    it("groth16 verify SUCCESS", async () => {
        vm.reset();
        groth16Verify(Key.fromSnarkjs(vKey), Proof.fromSnarkjs(proof, publicSignals));
        assert(vm.success == true);
    });

    it("groth16 verify FAIL", async () => {
        vm.reset();
        groth16Verify(Key.fromSnarkjs(vKey), Proof.fromSnarkjs(proof, badPublicSignals));
        assert(vm.success == false);
    });
});
