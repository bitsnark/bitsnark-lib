import { randomBytes } from "crypto";



const ba = [];
for (let i = 0; i < 310000 + 310000 * 3 * 8; i++) {
    const b = Buffer.from(randomBytes(32));
    ba.push(b);
    if (i % 1000 == 0) {
        console.log(i);
    }
}
for (let i = 0; i < 1000000000000; i++) {
    console.log(ba.length);
}
