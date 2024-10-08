"""
JSON parsing utilities
"""


def parse_bignum(s: str) -> int:
    if not isinstance(s, str):
        raise TypeError(f"Expected string, got {type(s)}")
    if not s.startswith("0x"):
        raise ValueError("Invalid prefix for bignum")
    if not s.endswith("n"):
        raise ValueError("Invalid suffix for bignum")
    ret = s.removeprefix("0x")[:-1]
    assert all(c in "0123456789abcdef" for c in ret)
    return int(ret, 16)


def parse_hex_str(s: str) -> str:
    if not isinstance(s, str):
        raise TypeError(f"Expected string, got {type(s)}")
    if not s.startswith("hex:"):
        raise ValueError("Invalid prefix for hex string")
    ret = s.removeprefix("hex:")
    assert all(c in "0123456789abcdef" for c in ret)
    return ret


def parse_hex_bytes(s: str) -> bytes:
    return bytes.fromhex(parse_hex_str(s))


def serialize_hex(b: bytes | str) -> str:
    if isinstance(b, str):
        assert all(c in "0123456789abcdef" for c in b)
        return "hex:" + b
    assert isinstance(b, bytes)
    return "hex:" + b.hex()
