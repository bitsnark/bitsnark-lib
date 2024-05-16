export interface SavedVm<InstrCode> {
    hardcoded: string[];
    witness: string[];
    registers: number;
    programLength: number;
    program: {
        name: InstrCode,
        target: number,
        params: number[],
        data?: string
    }[];
}
