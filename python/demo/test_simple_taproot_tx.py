from decimal import Decimal

import bitcointx
from bitcointx.core import (
    COutPoint,
    CTransaction,
    CTxIn,
    CTxInWitness,
    CTxOut,
    CTxWitness,
    script as ops,
)
from bitcointx.core.key import XOnlyPubKey
from bitcointx.core.script import (
    CScript,
    CScriptWitness,
    OP_3,
)
from bitcointx.core.scripteval import VerifyScript
from bitcointx.wallet import (
    CCoinAddress,
    P2TRCoinAddress,
    TaprootScriptTree,
)

from .bitcoin_rpc import BitcoinRPC
from .bitcoin_wallet import BitcoinWallet
from .docker_compose import start_stop_docker_compose

RPC_BASE_URL = "http://rpcuser:rpcpassword@localhost:18443"

def test_scripteval():
    bitcointx.select_chain_params("bitcoin/regtest")
    script_pubkey = CScript([OP_3, ops.OP_EQUAL])
    script_sig_stack = [OP_3]
    # script_pubkey = CScript([ops.OP_VERIFY, OP_1])
    # script_sig_stack = [OP_1]
    script_sig = CScript(script_sig_stack)
    tx1 = CTransaction(
        vin=[
            CTxIn(
                prevout=COutPoint(
                    hash=b'\x00' * 32,
                    n=0,
                ),
            ),
        ],
        vout=[
            # CTxOut(
            #     nValue=1,
            #     # scriptPubKey=CCoinAddress("bcrt1qcltugs26pspalrtyd2pax5l4npsv2p5auuelq4").to_scriptPubKey(),
            #     scriptPubKey=CScript([ops.OP_RETURN, b'hello']),
            # ),
        ],
    )

    # print("Eval")
    # EvalScript(
    #     stack=script_sig_stack,
    #     scriptIn=script_pubkey,
    #     inIdx=0,
    #     txTo=tx1,
    # )
    # print("Eval Ok.")

    print("Verify")
    VerifyScript(
        scriptSig=script_sig,
        scriptPubKey=script_pubkey,
        inIdx=0,
        txTo=tx1,
    )
    print("All Ok.")


@start_stop_docker_compose
def test_simple_taproot_tx():
    bitcointx.select_chain_params("bitcoin/regtest")
    rpc = BitcoinRPC(RPC_BASE_URL)
    print("Simple taproot tx test")
    print("Creating test wallet")
    wallet = BitcoinWallet.create(
        name="test_simpletaproot",
        rpc_base_url=RPC_BASE_URL,
    )
    print("Wallet address:", wallet.get_receiving_address())
    print("Mining initial balance and enabling segwit")
    # segwit requires 432 blocks or something like that, in regtest
    rpc.mine_blocks(4, wallet.get_receiving_address())  # get some utxos
    rpc.mine_blocks(500 - 4)  # mine to a random address to prevent balances from increasing
    print("Wallet balance (BTC)", wallet.get_balance_btc())

    internal_pubkey = XOnlyPubKey.fromhex("55adf4e8967fbd2e29f20ac896e60c3b0f1d5b0efa9d34941b5958c7b0a0312d")
    script = CScript([OP_3, ops.OP_EQUALVERIFY, ops.OP_1], name='myscript')
    # script = CScript([ops.OP_VERIFY, ops.OP_1], name='myscript')
    # script = CScript([OP_1], name='myscript')
    taptree = TaprootScriptTree(
        internal_pubkey=internal_pubkey,
        leaves=[
            script,
        ],
    )
    tap_address = P2TRCoinAddress.from_script_tree(taptree)
    balance = rpc.get_address_balance(tap_address)
    print("Tap balance", balance)
    assert balance == 0
    wallet.send(
        amount_btc=1,
        receiver=tap_address,
    )
    rpc.mine_blocks()
    balance = rpc.get_address_balance(tap_address)
    print("Tap balance", balance)
    assert balance == 1

    spending_script, control_block = taptree.get_script_with_control_block('myscript')
    assert spending_script == script

    utxo_response = rpc.scantxoutset(address=tap_address)
    # print(utxo_response["unspents"])
    assert len(utxo_response["unspents"]) == 1
    utxo = utxo_response["unspents"][0]
    inputs = [
        CTxIn(
            prevout=COutPoint(
                hash=bytes.fromhex(utxo["txid"])[::-1],
                n=utxo["vout"],
            ),
        ),
    ]
    fee = 10**5
    transfer_amount_sat = int(utxo["amount"] * 10**8) - fee
    outputs = [
        CTxOut(
            nValue=transfer_amount_sat,
            scriptPubKey=CCoinAddress(wallet.get_receiving_address()).to_scriptPubKey(),
        ),
    ]
    fail_tx = CTransaction(
        vin=inputs,
        vout=outputs,
        witness=CTxWitness(vtxinwit=[
            CTxInWitness(
                CScriptWitness([
                    b'0000000000000000000000000000000000000000000000000000000000000000',
                    script,
                    control_block
                ]),
            ),
        ]),
    )
    ok_elems = [
        b'\x03',
    ]
    ok_tx = CTransaction(
        vin=inputs,
        vout=outputs,
        witness=CTxWitness(vtxinwit=[
            CTxInWitness(
                CScriptWitness([
                    # CScript(ok_elems),
                    *ok_elems,
                    script,
                    control_block
                ]),
            ),
        ]),
    )
    print("VerifyScript")
    try:
        VerifyScript(
            scriptSig=CScript(ok_elems),
            scriptPubKey=script,
            inIdx=0,
            txTo=ok_tx,
        )
    except Exception as e:
        print(f"VerifyScript failed: {e}")
    else:
        print("VerifyScript OK.")
    print("testmempoolaccept")
    fail_tx_response = rpc.call('testmempoolaccept', [
        fail_tx.serialize().hex(),
    ])
    ok_tx_response = rpc.call('testmempoolaccept', [
        ok_tx.serialize().hex(),
    ])
    mempoolaccept_response = fail_tx_response + ok_tx_response
    print(mempoolaccept_response)
    assert [tx['allowed'] for tx in mempoolaccept_response] == [False, True]

    prev_wallet_balance = wallet.get_balance_btc()
    print("Prev wallet balance", prev_wallet_balance)
    rpc.call('sendrawtransaction', ok_tx.serialize().hex())
    rpc.mine_blocks()
    new_wallet_balance = wallet.get_balance_btc()
    print("New wallet balance", new_wallet_balance)
    print("New wallet balance (expected)", prev_wallet_balance + Decimal(transfer_amount_sat) / 10**8)
    assert new_wallet_balance == prev_wallet_balance + Decimal(transfer_amount_sat) / 10**8
    taproot_balance = rpc.get_address_balance(tap_address)
    assert taproot_balance == 0



if __name__ == '__main__':
    test_scripteval()
    test_simple_taproot_tx()
