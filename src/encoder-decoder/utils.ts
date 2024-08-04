
export function bufferTo3BitArray(buffer: Buffer) {
    const result = [];
    let bitCount = 0;
    let nibbleValue = 0;
    for (const byte of buffer) {
        for (let i = 0; i < 8; i++) {
            const bit = (byte >> i) & 1;
            nibbleValue = bit * 2 ** bitCount + nibbleValue;
            bitCount++;
            if (bitCount === 3) {
                result.push(nibbleValue);
                nibbleValue = 0;
                bitCount = 0;
            }
        }
    }
    if (bitCount > 0) result.push(nibbleValue);
    return result;
}

export function arrayToBuffer(arr: number[], bufferSize: number): Buffer {
    const buffer = Buffer.alloc(bufferSize);
    let byteIndex = 0;
    let bitCount = 0;
    let byteValue = 0;
    for (const value of arr) {
        if (byteIndex >= bufferSize) break; // Break the loop if the buffer is full
        for (let i = 0; i < 3; i++) {
            const bit = (value >> i) & 1;
            byteValue |= bit << bitCount;
            bitCount++;
            if (bitCount === 8) {
                buffer[byteIndex] = byteValue;
                byteValue = 0;
                bitCount = 0;
                byteIndex++;
            }
        }
    }
    return buffer;
}