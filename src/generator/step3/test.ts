

function get(w: number, bits: number) {

    const unitsNoChecksum = Math.ceil(bits / w);
    const checksumBits = Math.log2(unitsNoChecksum * (2 ** w));
    const units = Math.ceil((bits + checksumBits) / w);
    const encodedBytes = 32 * units;

    const decoderBytesPerUnit = 32 + 12 * 2 ** w + 4 + 7;
    const decoderBytes = units * decoderBytesPerUnit + 4 + w + 10;
    const total = encodedBytes + decoderBytes;

    const lamport = bits * 32 + 23 + bits * 2 * 32;
    const ratio = total / lamport;

    console.log(`w: ${w} \tbits: ${bits} \t total: ${total} \t lamport: ${lamport} \t ratio: ${ratio}`);
}

[ 1, 2, 3, 4, 5, 6, 7, 8 ].forEach(w => {
    [1, 2, 4, 8, 16, 32, 64, 128, 256, 2880 ].forEach(bits => {
        get(w, bits);
    });
});