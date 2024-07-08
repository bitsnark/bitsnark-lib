export interface ProgramLine<InstrCode> {
    name: InstrCode,
    target: number,
    param1?: number,
    param2?: number
    bit?: number
}

export interface SavedVm<InstrCode> {
    hardcoded: string[];
    witness: string[];
    registers: number;
    successIndex: number;
    programLength: number;
    program: ProgramLine<InstrCode>[];
}
