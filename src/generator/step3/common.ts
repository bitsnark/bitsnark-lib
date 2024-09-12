
export enum ProtocolStep {
    INITIAL = 'INITIAL',
    CHALLENGE = 'CHALLENGE',
    STEP1 = 'STEP1',
    TRANSITION = 'TRANSITION',
    STEP2 = 'STEP2',
    FINAL = 'FINAL'
}

const stepToNum = {
    [ProtocolStep.INITIAL]: 0,
    [ProtocolStep.CHALLENGE]: 1,
    [ProtocolStep.STEP1]: 2,
    [ProtocolStep.TRANSITION]: 3,
    [ProtocolStep.STEP2]: 4,
    [ProtocolStep.FINAL]: 5,
};




export function getEncodingIndexForPat(step: ProtocolStep, iteration: number, registerIndex: number): number {
    return stepToNum[step] * 1000000 + iteration * 256 * 256 + registerIndex * 256;
}




