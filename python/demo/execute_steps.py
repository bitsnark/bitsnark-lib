import argparse
import time
from decimal import Decimal
from pprint import pprint

import bitcointx
from bitcointx.core import (
    COutPoint,
    CTransaction,
    CTxIn,
    CTxOut,
    CTxWitness,
)
from bitcointx.wallet import CCoinAddress

from .bitcoin_rpc import BitcoinRPC
from .steps import (
    get_step_names,
    load_step_data,
)


def execute_steps(
    *,
    rpc: BitcoinRPC,
    step0_initial_input_txid: str,
    step0_initial_input_vout: int,
    step1_challenge_input_txid: str,
    step1_challenge_input_vout: int,
    final_address: str,
    fee_rate_sat_per_vb: int,
    max_txs_in_block: int = 8,
):
    steps = [
        load_step_data(name)
        for name in get_step_names()
    ]
    txids = {}
    block_number = rpc.call('getblockcount')

    def wait_for_new_block():
        nonlocal block_number
        print(f"Waiting for new block (current block number: {block_number})...")
        start_time = log_timer_start = time.time()
        while True:
            new_block_number = rpc.call('getblockcount')
            if new_block_number > block_number:
                block_number = new_block_number
                break
            ts = time.time()
            elapsed = ts - start_time
            log_elapsed = ts - log_timer_start
            if log_elapsed > 60:
                log_timer_start = ts
                print(f"Still waiting for a new block (current: {block_number}, last: {new_block_number}, time waited: {elapsed})")
            time.sleep(5)

    # step0 starts with pre-determined input utxo
    input_outpoints = [(step0_initial_input_txid, step0_initial_input_vout)]

    try:
        for i, step in enumerate(steps):
            print(f"Step {step.name}:")

            if i + 1 < len(steps):
                next_address = steps[i + 1].taproot_address
            else:
                next_address = CCoinAddress(final_address)

            if step.name.startswith("01_CHALLENGE"):
                # step1 has two inputs, one from step0 and one from func parameters
                # lol, check with startwith...
                input_outpoints.append((step1_challenge_input_txid, step1_challenge_input_vout))

            inputs = []
            input_witnesses = []
            spent_outputs = []
            total_input_amount_btc = Decimal(0)
            for txid, vout in input_outpoints:
                tx = rpc.call('getrawtransaction', txid, True)
                prev_out = tx['vout'][vout]
                total_input_amount_btc += prev_out['value']

                inputs.append(CTxIn(
                    prevout=COutPoint(
                        hash=bytes.fromhex(txid)[::-1],
                        n=vout,
                    ),
                ))
                spent_outputs.append(CTxOut(
                    nValue=int(prev_out['value'] * 10**8),
                    scriptPubKey=step.taproot_address.to_scriptPubKey(),
                ))
                # We assume we only spend prevouts that are unlocked by the script in the step
                # as such, the witness is simply repeated for each input
                # dummy witness for estimation
                input_witnesses.append(step.witness)

            total_input_amount_sat = int(total_input_amount_btc * 10**8)

            # dummy tx to estimate size
            tx_size_vb = CTransaction(
                vin=inputs,
                vout=[
                    CTxOut(
                        nValue=total_input_amount_sat,
                        scriptPubKey=next_address.to_scriptPubKey(),
                    ),
                ],
                witness=CTxWitness(input_witnesses),
            ).get_virtual_size()
            fee = int(tx_size_vb * fee_rate_sat_per_vb)
            assert fee < total_input_amount_sat, f"Fee {fee} is more than input amount {total_input_amount_sat}"

            # Create a new tx with the correct fee
            outputs = [
                CTxOut(
                    nValue=total_input_amount_sat - fee,
                    scriptPubKey=next_address.to_scriptPubKey(),
                ),
            ]
            tx = CTransaction(
                vin=inputs,
                vout=outputs,
                nVersion=2,
            )
            input_witnesses = [
                step.get_witness_with_signature(tx, i, spent_outputs=spent_outputs)
                for i in range(len(inputs))
            ]

            tx = CTransaction(
                vin=inputs,
                vout=outputs,
                witness=CTxWitness(vtxinwit=input_witnesses),
            )

            print("Sending raw transaction...")
            txid = rpc.call('sendrawtransaction', tx.serialize().hex())
            txids[step.name] = txid
            input_outpoints = [(txid, 0)]  # always vout 0
            print("")

            if (i + 1) % max_txs_in_block == 0:
                wait_for_new_block()
                print("")

    except Exception as e:
        print(f"Error: {str(e)[:200]}")
        raise
    finally:
        print("Txids of sent transactions")
        pprint(txids)
        # with open("txids.json", "w") as f:
        #     json.dump(txids, f, indent=2)


def plan_steps():
    step0 = load_step_data("00_INITIAL_PAT.txt")
    step1 = load_step_data("01_CHALLENGE_VIC.txt")
    print("Step0 address:", step0.taproot_address)
    print("Step1 address:", step1.taproot_address)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--network', choices=['mainnet', 'testnet', 'regtest'], required=True)
    parser.add_argument('--rpc', help="bitcoin rpc url", required=True)
    subparsers = parser.add_subparsers(dest='command', required=True)

    subparsers.add_parser('plan')

    parser_execute = subparsers.add_parser('execute')
    parser_execute.add_argument('--step0-initial-prevout', help="txid:vout", required=True)
    parser_execute.add_argument('--step1-challenge-prevout', help="txid:vout", required=True)
    parser_execute.add_argument('--final-address', required=True)
    parser_execute.add_argument('--fee-rate', help="sats per vB", type=int, required=True)

    args = parser.parse_args()

    bitcointx.select_chain_params(f"bitcoin/{args.network}")

    if args.command == 'plan':
        plan_steps()
    elif args.command == 'execute':
        print("args:", args)
        if input("Continue? (y/n): ") != 'y':
            return

        step0_initial_txid, step0_initial_vout = args.step0_initial_prevout.split(':')
        step1_challenge_txid, step1_challenge_vout = args.step1_challenge_prevout.split(':')
        rpc = BitcoinRPC(args.rpc)
        execute_steps(
            rpc=rpc,
            step0_initial_input_txid=step0_initial_txid,
            step0_initial_input_vout=int(step0_initial_vout),
            step1_challenge_input_txid=step1_challenge_txid,
            step1_challenge_input_vout=int(step1_challenge_vout),
            final_address=args.final_address,
            fee_rate_sat_per_vb=args.fee_rate,
        )
    else:
        raise Exception("Unknown command")



if __name__ == "__main__":
    main()