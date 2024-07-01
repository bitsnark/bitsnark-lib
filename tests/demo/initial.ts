import fs from 'fs';
import { Bitcoin } from '../../src/generator/step3/bitcoin';
import { bufferToBigints256, encodeWinternitz, winternitzKeys } from '../encoding';

const proof = {
    "pi_a": ["4531350982720745483183896166010272188780196700199407980342269744581989148149",
        "8537072424426339037594105475681425616791387434880920465097584850313527560965"],
    "pi_b": [
        ["2411699281801306923564935501152972918367713935498519592436730569804473762071",
            "9802075445186058683936769178514143384687031267769197843391560534835079597863"],
        ["9841644077687891842107824701324051165061919977670341286300780240127706993433",
            "542961677870429289316706958907664752199371035048761897149284127652926867503"]],
    "pi_c": ["3973245501156043393965035252994987222825469293526203824011347102421386558530",
        "5182492167196517803964084985226343839022108025654500361628202698319357889198"],
};
const publicSignals = ["19820469076730107577691234630797803937210158605698999776717232705083708883456", "11"];

export async function createInitialTx() {
    const bitcoin = new Bitcoin();
    const encoded = [
        ...proof.pi_a,
        ...proof.pi_b[0],
        ...proof.pi_b[1],
        ...proof.pi_a,
        ...publicSignals
    ]
        .map(s => BigInt(s))
        .map((w, i) => encodeWinternitz(w, i, 256, 12));

    const encodedWitness: bigint[] = [];
    encoded.forEach(buffer => bufferToBigints256(buffer).forEach(n => encodedWitness.push(n)));
    const witness = encodedWitness.map(w => bitcoin.addWitness(w));
    const publicKeys = winternitzKeys.slice(0, witness.length).map(k => k.pblc);
    bitcoin.checkInitialTransaction(witness, publicKeys);

    if (!bitcoin.success) throw new Error('Failed');

    console.log('data size: ', encodedWitness.length * 32);
    console.log('progam size: ', bitcoin.programSizeInBitcoinBytes());
    console.log('max stack size: ', bitcoin.maxStack);

    const program = bitcoin.programToString();
    fs.writeFileSync('./generated/demo/initial.btc.txt', program);
    fs.writeFileSync('./generated/demo/initial.data.txt', encodedWitness.map(n => '0x' + n.toString(16)).join('\n'));
}

createInitialTx();

