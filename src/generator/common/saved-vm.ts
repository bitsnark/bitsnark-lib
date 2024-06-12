export interface ProgramLine<InstrCode> {
    name: InstrCode,
    target: number,
    param1?: number,
    param2?: number
    data?: string
}

export interface SavedVm<InstrCode> {
    hardcoded: string[];
    witness: string[];
    registers: number;
    programLength: number;
    program: ProgramLine<InstrCode>[];
}
