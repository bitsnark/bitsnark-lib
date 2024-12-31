export function satsToBtc(sats: bigint): number {
    return Number(sats) / 100000000;
}

export function btcToSats(btc: number): bigint {
    return BigInt(Math.round(btc * 100000000));
}
