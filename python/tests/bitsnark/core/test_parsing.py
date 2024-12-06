from bitsnark.core.parsing import parse_bignum, parse_hex_str, parse_hex_bytes


def test_parse_bignum():
    assert parse_bignum("bigint:3b9aca00n") == 0x3b9aca00
    pass


def test_parse_hex_str():
    assert parse_hex_str("Buffer:51201c5b544e53ee4c965d3c91f8df230af3d41adb51067b4f2f38074c6945797b6d") == \
        "51201c5b544e53ee4c965d3c91f8df230af3d41adb51067b4f2f38074c6945797b6d"


def tet_parse_hex_bytes():
    assert parse_hex_bytes("Buffer:51201c5b544e53ee4c965d3c91f8df230af3d41adb51067b4f2f38074c6945797b6d") == \
           bytes.fromhex("51201c5b544e53ee4c965d3c91f8df230af3d41adb51067b4f2f38074c6945797b6d")

