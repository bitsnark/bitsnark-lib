"""
JSON parsing utilities
"""


def parse_bignum(s: str) -> int:
    print(f"FOOOOOOOOOOO {s}")
    if not isinstance(s, str):
        raise TypeError(f"Expected string, got {type(s)}")
    if not s.startswith("bigint:"):
        raise ValueError(f"Invalid prefix for bignum: {s}")
    if not s.endswith("n"):
        raise ValueError(f"Invalid suffix for bignum: {s}")
    ret = s.removeprefix("bigint:")[:-1]
    assert all(c in "0123456789abcdef" for c in ret)
    return int(ret, 16)


def parse_hex_str(s: str) -> str:
    if not isinstance(s, str):
        raise TypeError(f"Expected string, got {type(s)}")
    if not s.startswith("Buffer:"):
        raise ValueError(f"Invalid prefix for hex string {s}")
    ret = s.removeprefix("Buffer:")
    assert all(c in "0123456789abcdef" for c in ret)
    return ret


def parse_hex_bytes(s: str) -> bytes:
    return bytes.fromhex(parse_hex_str(s))


def serialize_hex(b: bytes | str) -> str:
    if isinstance(b, str):
        assert all(c in "0123456789abcdef" for c in b)
        return "Buffer:" + b
    assert isinstance(b, bytes)
    return "Buffer:" + b.hex()
