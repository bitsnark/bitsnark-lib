import { describe, expect, it } from "@jest/globals";
import {
    _32To256BE,
    _32To256LE,
    _256To32BE,
    _256To32LE,
    bigintToBufferBE,
    bitsToBigint,
    bufferToBigints256BE,
    hash,
    hashPair,
    padHex,
    strToBigint,
    bytesFromBigint,
} from "../../src/encoding/encoding";

describe("strToBigint", () => {
    it("should convert a string to a bigint", () => {
        expect(strToBigint("")).toBe(0n);
        expect(strToBigint("0")).toBe(48n);
        expect(strToBigint("1")).toBe(49n);
        expect(strToBigint("A")).toBe(65n);
        expect(strToBigint("a")).toBe(97n);
        expect(strToBigint("Hello, World!")).toBe(5735816763073854918203775149089n);
    });
});

describe("bigintToBufferBE", () => {
    it("should convert a bigint to a Buffer in big-endian order", () => {
        expect(bigintToBufferBE(0n, 1)).toEqual(Buffer.from("00", "hex"));
        expect(bigintToBufferBE(123n, 2)).toEqual(Buffer.from("007b", "hex"));
        expect(bigintToBufferBE(123456789n, 4)).toEqual(Buffer.from("075bcd15", "hex"));
        expect(bigintToBufferBE(12345678901234567890n, 8)).toEqual(
            Buffer.from("ab54a98ceb1f0ad2", "hex"),
        );
    });
});

describe("bufferToBigints256BE", () => {
    it("should convert a buffer to an array of 256-bit bigints in big-endian order", () => {
        const buffer = Buffer.from(
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "hex",
        );
        expect(bufferToBigints256BE(buffer)).toEqual([
            514631507721405306298073637848375664226723355710112857507800679889911926255n,
            514631507721405306298073637848375664226723355710112857507800679889911926255n,
        ]);
    });

    it("should throw an error for an invalid buffer size", () => {
        const buffer = Buffer.from("0123456789abcdef0123456789abcde", "hex");
        expect(() => bufferToBigints256BE(buffer)).toThrow("invalid size");
    });
});

describe("padHex", () => {
    it("should pad the hex string with zeros to the specified number of bytes", () => {
        // Two hex characters make up one byte
        expect(padHex("1", 2)).toBe("0001");
        expect(padHex("10", 4)).toBe("00000010");
        expect(padHex("ABC", 1)).toBe("ABC");
        expect(padHex("123456789", 5)).toBe("0123456789");
    });
});

describe("hash", () => {
    it("should hash the input bigint once by default", () => {
        expect(hash(0n)).toBe(0x66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925n);
    });
    it("should hash the input bigint the specified number of times", () => {
        expect(hash(12345678n, 2)).toBe(
            0x17d286b1ac05f24280a870655eac0b50b774f6b3a538fd34f3662d4d6dc9f4e9n,
        );
    });
    it("hashing twice should return the same result as hashing once with times 2", () => {
        expect(hash(0n, 2)).toBe(hash(hash(0n)));
    });
});

describe("hashPair", () => {
    it("should hash the pair of input bigints", () => {
        expect(hashPair(123n, 456n)).toBe(
            0xe03e1ee464b067e1fd0570cd3ca6829cf5041843ec151dffbc3b29340ee77045n,
        );
    });
    it("should not generate the same hash for reverse order", () => {
        expect(hashPair(456n, 123n)).not.toBe(hashPair(123n, 456n));
    });
});

describe("bitsToBigint", () => {
    it("should convert an reverse array of bits to a bigint", () => {
        expect(bitsToBigint([0, 1, 0, 1])).toBe(10n);
        expect(bitsToBigint([1, 1, 0, 0, 1, 0])).toBe(19n);
        expect(bitsToBigint([1, 0, 1])).toBe(5n);
        expect(bitsToBigint([0, 0, 0, 0, 0, 0, 0, 0])).toBe(0n);
    });
});

describe("_256To32LE", () => {
    it("should convert a bigint to an array of 32-bit little-endian bigints", () => {
        expect(_256To32LE(123n)).toEqual([123n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]);
        expect(_256To32LE(123123123123n)).toEqual([2864038835n, 28n, 0n, 0n, 0n, 0n, 0n, 0n]);
    });
});

describe("_256To32BE", () => {
    it("should convert a bigint to an array of 32-bit bigints in big-endian order", () => {
        expect(_256To32BE(123n)).toEqual([0n, 0n, 0n, 0n, 0n, 0n, 0n, 123n]);
        expect(_256To32BE(123123123123n)).toEqual([0n, 0n, 0n, 0n, 0n, 0n, 28n, 2864038835n]);
    });
});

describe("_32To256LE", () => {
    it("should convert a 32-bit little-endian bigint bigint array to a bigint", () => {
        expect(_32To256LE([123n, 0n, 0n, 0n, 0n, 0n, 0n, 0n])).toEqual(123n);
        expect(_32To256LE([2864038835n, 28n, 0n, 0n, 0n, 0n, 0n, 0n])).toEqual(123123123123n);
    });

    it("should throw an error for an invalid array size", () => {
        expect(() => _32To256LE([123n, 0n, 0n, 0n, 0n, 0n, 0n])).toThrow("invalid size");
    });
});

describe("_32To256BE", () => {
    it("should convert a 32-bit big-endian bigint array to a bigint", () => {
        expect(_32To256BE([0n, 0n, 0n, 0n, 0n, 0n, 0n, 123n])).toEqual(123n);
        expect(_32To256BE([0n, 0n, 0n, 0n, 0n, 0n, 28n, 2864038835n])).toEqual(123123123123n);
    });
});

describe("bytesFromBigInt", () => {
    it("should work", () => {
        expect(bytesFromBigint(0x12n)).toEqual(Buffer.from("12", "hex"));
        expect(bytesFromBigint(0x0n)).toEqual(Buffer.from("00", "hex"));
    });

    it("should not fail miserably for odd-length numbers", () => {
        expect(bytesFromBigint(2n)).toEqual(Buffer.from("02", "hex"));
        expect(bytesFromBigint(256n)).toEqual(Buffer.from("0100", "hex"));
        expect(bytesFromBigint(0x123n)).toEqual(Buffer.from("0123", "hex"));
    });
});
