import argparse
import sys
from decimal import Decimal
from typing import NamedTuple

import bitcointx
from bitcointx.core import (
    COutPoint,
    CTransaction,
    CTxIn,
    CTxOut,
    CTxWitness,
)
from bitcointx.wallet import CCoinAddress

from .execute_steps import execute_steps
from .bitcoin_rpc import BitcoinRPC
from .bitcoin_wallet import BitcoinWallet
from .docker_compose import start_stop_docker_compose
from .steps import (
    get_step_names,
    load_step_data,
)
from .testhelpers import start_mining, stop_mining

RPC_BASE_URL = "http://rpcuser:rpcpassword@localhost:18443"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("test", choices=["full_flow", "steps"], default="full_flow", nargs="?")
    parser.add_argument("filter", default="", nargs="?")
    parser.add_argument("--docker", action="store_true")
    args = parser.parse_args()

    if args.test == "full_flow":
        print("Testing full flow (not implemented fully!)")
        func = test_full_flow
    elif args.test == "steps":
        if args.filter:
            print(f"Individually testing steps that start with '{args.filter}'")
        else:
            print("Testing all steps individually")
        func = lambda: test_steps(args.filter)
    else:
        raise NotImplementedError(args.test)

    if args.docker:
        print("Automatically starting and shutting down bitcoind regtest in docker compose")
        func = start_stop_docker_compose(func)

    func()


class Setup(NamedTuple):
    rpc: BitcoinRPC
    wallet: BitcoinWallet


def setup() -> tuple[BitcoinRPC, BitcoinWallet]:
    bitcointx.select_chain_params("bitcoin/regtest")
    rpc = BitcoinRPC(RPC_BASE_URL)
    print("Creating test wallet")
    wallet, created = BitcoinWallet.load_or_create(
        name="test_wallet",
        rpc_base_url=RPC_BASE_URL,
    )
    print("Wallet address:", wallet.get_receiving_address())
    print("Wallet balance (BTC)", wallet.get_balance_btc())
    if created:
        print("Mining initial balance and enabling segwit")
        # segwit requires 432 blocks or something like that, in regtest
        rpc.call("generatetoaddress", 500, wallet.get_receiving_address())
        print("Wallet balance (BTC)", wallet.get_balance_btc())

    return Setup(
        rpc=rpc,
        wallet=wallet,
    )


def test_full_flow():
    rpc, wallet = setup()

    step0 = load_step_data("00_INITIAL_PAT.txt")
    step1 = load_step_data("01_CHALLENGE_VIC.txt")

    print("Step -1: Fund 00_INITIAL and 01_CHALLENGE wallets")
    initial_utxo_txid = wallet.send(
        amount_btc=Decimal('0.5'),
        receiver=step0.taproot_address,
    )
    challenge_utxo_txid = wallet.send(
        amount_btc=Decimal('0.5'),
        receiver=step1.taproot_address,
    )
    # apparently, the order of outputs in sendtoaddress is totally random, so we have to figure out
    # what outputs we're using
    initial_utxo_vout = rpc.find_vout_index(initial_utxo_txid, step0.taproot_address)
    challenge_utxo_vout = rpc.find_vout_index(challenge_utxo_txid, step1.taproot_address)
    rpc.mine_blocks()

    final_address = wallet.get_new_address()
    final_address_start_balance = rpc.get_address_balance(final_address)
    assert final_address_start_balance == 0, \
        f"Initial balance of address {final_address} is {final_address_start_balance}, expected 0"

    start_mining(rpc, interval=2.0)
    try:
        execute_steps(
            rpc=rpc,
            step0_initial_input_txid=initial_utxo_txid,
            step0_initial_input_vout=initial_utxo_vout,
            step1_challenge_input_txid=challenge_utxo_txid,
            step1_challenge_input_vout=challenge_utxo_vout,
            final_address=final_address,
            fee_rate_sat_per_vb=10,
        )
    except Exception as e:
        print("Exception: {}...".format(str(e)[:1000]))
        sys.exit(1)
    finally:
        stop_mining()

    rpc.mine_blocks()
    final_balance = rpc.get_address_balance(final_address)
    print("Final address balance after tx pingpong:", final_balance)


def test_steps(
    name_filter: str = ""
):
    rpc, wallet = setup()

    success_by_step = {}
    reasons_by_step = {}
    step_names = get_step_names(name_filter)
    for step_name in step_names:
        print("Testing", step_name)
        try:
            success, reason = test_step(
                step_name,
                wallet=wallet,
                rpc=rpc,
            )
        except Exception as e:
            print("Exception:", e)
            success = False
            reason = str(e)
        if success:
            print("SUCCESS.")
        else:
            print("FAIL")
        success_by_step[step_name] = success
        reasons_by_step[step_name] = reason

    print("")
    print("Summary:")
    for step_name, success in success_by_step.items():
        status = "SUCCESS" if success else "FAIL"
        reason = reasons_by_step.get(step_name, "")
        if reason:
            reason = f" ({reason})"
        print(f"{step_name:<25}: {status}{reason}")
    print("Successes: ", sum(success_by_step.values()))
    print("Failures:  ", len(success_by_step) - sum(success_by_step.values()))


def test_step(
    step_name: str,
    *,
    wallet: BitcoinWallet,
    rpc: BitcoinRPC,
) -> [bool, str]:
    step = load_step_data(step_name)

    transfer_amount_btc = 1
    transfer_amount_sat = int(transfer_amount_btc * 10**8)  # excl fees
    fee_rate_sat_per_vb = 10

    wallet.send(
        amount_btc=transfer_amount_btc,
        receiver=step.taproot_address,
    )
    wallet.mine()

    utxo_response = rpc.scantxoutset(address=step.taproot_address)
    # print(utxo_response["unspents"])
    assert len(utxo_response["unspents"]) >= 1, "No utxos, shouldn't happen"
    if len(utxo_response["unspents"]) != 1:
        print(f"Warning: Duplicate taproot address for step (Expected 1 UTXO, got {len(utxo_response['unspents'])})")
        utxo_response["unspents"].sort(key=lambda x: x["amount"], reverse=True)

    utxo = utxo_response["unspents"][0]

    inputs = [
        CTxIn(
            prevout=COutPoint(
                hash=bytes.fromhex(utxo["txid"])[::-1],
                n=utxo["vout"],
            ),
        ),
    ]
    input_amount_sat = int(utxo["amount"] * 10**8)
    assert input_amount_sat >= transfer_amount_sat
    spent_outputs = [
        CTxOut(
            nValue=int(utxo["amount"] * 10 ** 8),
            scriptPubKey=step.taproot_address.to_scriptPubKey(),
        )
    ]
    input_amount_sat = int(utxo["amount"] * 10 ** 8)

    outputs = [
        CTxOut(
            nValue=transfer_amount_sat,  # deduct fees later
            scriptPubKey=CCoinAddress(wallet.get_receiving_address()).to_scriptPubKey(),
        ),
    ]
    tx_size_vb = CTransaction(
        vin=inputs,
        vout=outputs,
        witness=CTxWitness(vtxinwit=[
            step.witness,
        ]),
    ).get_virtual_size()
    fee = int(tx_size_vb * fee_rate_sat_per_vb)

    # Create a new tx with the correct fee
    outputs = [
        CTxOut(
            nValue=transfer_amount_sat - fee,
            scriptPubKey=CCoinAddress(wallet.get_receiving_address()).to_scriptPubKey(),
        ),
    ]
    # tx = CTransaction(
    #     vin=inputs,
    #     vout=outputs,
    #     witness=CTxWitness(vtxinwit=[
    #         step.witness,
    #     ]),
    # )
    tx = CTransaction(
        vin=inputs,
        vout=outputs,
        witness=CTxWitness([
            step.get_witness_with_signature(CTransaction(
                vin=inputs,
                vout=outputs,
            ), 0, spent_outputs=spent_outputs),
        ]),
    )

    print("testmempoolaccept")
    mempoolaccept = rpc.call('testmempoolaccept', [tx.serialize().hex()])
    print(mempoolaccept)
    if not mempoolaccept[0]["allowed"]:
        reason = mempoolaccept[0]["reject-reason"]
        print(f"FAIL: testmempoolaccept failed with reason {reason}")
        return False, reason

    print("sendrawtransaction")
    sendrawtx = rpc.call('sendrawtransaction', tx.serialize().hex())
    print(sendrawtx, sendrawtx)

    return True, ""


if __name__ == '__main__':
    main()
