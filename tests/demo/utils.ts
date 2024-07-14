import fs from 'fs';
import { Bitcoin } from "../../src/generator/step3/bitcoin";
import { simpleTaproot } from "../../src/generator/taproot/taproot";
import { ProtocolRole, ProtocolStep } from "./common";
import { internalPblicKey } from "./public-key";

const path = './tests/demo/generated';
let counter = 0;

function numToStr(pad: number, n?: number): string {
    let s = '' + (n ?? '');
    while (s.length < pad) s = '0' + s;
    return s;
}

export function writeToFile(bitcoin: Bitcoin, step: ProtocolStep, role: ProtocolRole, iteration?: number) {
    const taproot = simpleTaproot(Buffer.from(internalPblicKey, 'hex'), bitcoin.programToBinary());
    const out = {
        'title': `${step} ${role}${iteration != undefined ? ` ${iteration}` : ''}`,
        'data size (bytes)': bitcoin.witness.length * 32,
        'progam size (bytes)': bitcoin.programSizeInBitcoinBytes(),
        'max stack size': bitcoin.maxStack,
        'witness': bitcoin.witness.map(n => n.toString(16)),
        'taproot hash': taproot.root.toString('hex'),
        'control block': taproot.controlBlock.toString('hex'),
        'program': bitcoin.programToBinary().toString('hex'),
    };
    fs.writeFileSync(`${path}/${numToStr(2, counter++)}_${step}_${role}.txt`, JSON.stringify(out, null, '\t'));
}
