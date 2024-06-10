import fs from 'fs';
import groth16Verify, { Key, Proof } from './verifier';
import { vm } from './vm/vm';
import { regOptimizer } from './vm/reg-optimizer';

const vkey_path = './tests/groth16/verification_key.json';

const vKey = JSON.parse(fs.readFileSync(vkey_path).toString());

const proof = {
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

const publicSignals = ["19820469076730107577691234630797803937210158605698999776717232705083708883456", "11"];

groth16Verify(Key.fromSnarkjs(vKey), Proof.fromSnarkjs(proof, publicSignals));
if (!vm.success) throw new Error('Failed.');
vm.optimizeRegs();

const path = './generated/snark.json';
const obj = vm.save();
fs.writeFile(path, JSON.stringify(obj, undefined, 4), (err) => {
    if (err) console.log('Error writing file:', err);
    else console.log(`Successfully wrote file: ${path}`);
});
