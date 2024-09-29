// import groth16Verify, { Key, Proof as Step1_Proof } from '../../generator/step1/verifier';
// import { InstrCode, InstrCode as Step1_InstrCode } from '../../generator/step1/vm/types';
// import { proof, vKey } from '../../generator/step1/constants';
// import { Bitcoin } from '../../generator/step3/bitcoin';
// import { getTransactionByName, loadTransactionFromFile, Transaction } from '../transactions-new';
// import { bigintToNibblesLS } from './common';
// import { bufferToBigint160, iterations, twoDigits } from '../common';
// import { getWinternitzPublicKeys, WOTS_NIBBLES, WotsType } from '../winternitz';
// import { step1_vm, VM as Step1_vm } from '../../generator/step1/vm/vm';
// import { getRegsAt } from '../regs-calc';

// function getKeysForRegister(vm: Step1_vm, setupId: string, rIndex: number, line: number, transactions: Transaction[]) {
//     const regs = getRegsAt(vm, )
//     const keys = [
//         setupId, 
//         `state_${twoDigits(iterations - 1)}`, 
//         Math.floor(rIndex / ), scIndex, dataIndex].toString())
//     const stateTx = getTransactionByName(transactions, `state_${twoDigits(iterations)}`);
//     const output = stateTx.outputs[Math.floor(rIndex / 11)];



// }

// export function generateFinalStepTaproot(setupId: string, transactions: Transaction[]) {

//     const semiFinal = loadTransactionFromFile(setupId, 'semi-final');

//     groth16Verify(Key.fromSnarkjs(vKey), Step1_Proof.fromSnarkjs(proof));
//     step1_vm.optimizeRegs();
//     if (!step1_vm.success?.value) throw new Error('Failed.');
//     const program = step1_vm.instructions;

//     const scripts: Buffer[] = [];

//     program.forEach((line, index) => {

//         console.log('index: ', index);

//         const bitcoin = new Bitcoin();
//         bitcoin.setDefaultHash('HASH160');

//         const indexWitness = bigintToNibblesLS(BigInt(index))
//             .map(n => bitcoin.addWitness(BigInt(n)));

//         bitcoin.checkIndex(
//             semiFinal.outputs[0].spendingConditions[0].wotsPublicKeys![0].map(bufferToBigint160),
//             indexWitness
//         );

//         const a_w = new Array(WOTS_NIBBLES[WotsType._256]).fill(0).map(_ => bitcoin.addWitness(0n));
//         const a = bitcoin.newNibbles(WOTS_NIBBLES[WotsType._256]);
//         bitcoin.winternitzDecode256(
//             a, 
//             a_w, 
//             getWinternitzPublicKeys(WotsType._256, 
//             [setupId, t.transactionName, outputIndex, scIndex, dataIndex].toString())
//             .map(bufferToBigint160)
//         );


//         const b = bitcoin.newNibbles(WOTS_NIBBLES[WotsType._256]);
//         const c = bitcoin.newNibbles(WOTS_NIBBLES[WotsType._256]);


//         switch (line.name) {
//             case InstrCode.ADDMOD:
//                 bitcoin.step1_addMod();
//                 break;
//             case InstrCode.ANDBIT:
//                 bitcoin.step1_addMod();
//                 break;
//             case InstrCode.ANDNOTBIT:
//                 bitcoin.step1_addMod();
//                 break;
//             case InstrCode.MOV:
//                 bitcoin.step1_addMod();
//                 break;
//             case InstrCode.EQUAL:
//                 bitcoin.step1_addMod();
//                 break;
//             case InstrCode.MULMOD:
//                 const d = bitcoin.newNibbles(WOTS_NIBBLES[WotsType._256]);

//                 bitcoin.step1_addMod();
//                 break;
//             case InstrCode.OR:
//                 bitcoin.step1_addMod();
//                 break;
//             case InstrCode.AND:
//                 bitcoin.step1_addMod();
//                 break;
//             case InstrCode.NOT:
//                 bitcoin.step1_addMod();
//                 break;
//             case InstrCode.SUBMOD:
//                 bitcoin.step1_addMod();
//                 break;
//             case InstrCode.DIVMOD:
//                 bitcoin.step1_addMod();
//                 break;
//             case InstrCode.ASSERTONE:
//                 bitcoin.step1_addMod();
//                 break;
//             case InstrCode.ASSERTZERO:
//                 bitcoin.step1_addMod();
//                 break;
//         }

//         scripts.push(bitcoin.programToBinary());
//     });
// }

// var scriptName = __filename;
// if (process.argv[1] == scriptName) {
//     generateFinalStep('test_setup');
// }
