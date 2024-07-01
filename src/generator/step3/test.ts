

function get(w: number, bits: number) {

    let unitsNoChecksum = Math.ceil(bits / w);
    let checksumBits = Math.log2(unitsNoChecksum * (2 ** w));
    let units = Math.ceil((bits + checksumBits) / w);
    let encodedBytes = 32 * units;

    let decoderBytesPerUnit = 32 + 12 * 2 ** w + 4 + 7;
    let decoderBytes = units * decoderBytesPerUnit + 4 + w + 10;
    let total = encodedBytes + decoderBytes;

    let lamport = bits * 32 + 23 + bits * 2 * 32;
    let ratio = total / lamport;

    console.log(`w: ${w} \tbits: ${bits} \t total: ${total} \t lamport: ${lamport} \t ratio: ${ratio}`);
}

[ 1, 2, 3, 4, 5, 6, 7, 8 ].forEach(w => {
    [1, 2, 4, 8, 16, 32, 64, 128, 256, 2880 ].forEach(bits => {
        get(w, bits);
    });
});