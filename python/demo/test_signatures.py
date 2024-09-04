import bitcointx
from decimal import Decimal
from bitcointx import select_chain_params
from bitcointx.wallet import CCoinKey, P2TRCoinAddress
from bitcointx.core import COutPoint, CTxIn, CTxOut, CTransaction, CTxWitness, CTxInWitness, CBitcoinTxInWitness, CMutableTransaction
from bitcointx.core.script import CScript, CScriptWitness
from .bitcoin_rpc import BitcoinRPC
from bitcointx.core.script import CScript, OP_RETURN
from bitcointx.core.script import (CScript, OP_CHECKSIGADD, OP_CHECKSIG, OP_NUMEQUAL, TaprootScriptTree, CScriptWitness)
import os
from .bitcoin_wallet import BitcoinWallet
from .steps import (
    get_step_names,
    load_step_data,
    load_tx_json,
)
from .testhelpers import start_mining, stop_mining

RPC_BASE_URL = "http://rpcuser:rpcpassword@localhost:18443"

bitcointx.select_chain_params("bitcoin/regtest")
rpc = BitcoinRPC(RPC_BASE_URL)

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

# Generate a new Schnorr key pair
private_key = CCoinKey.from_secret_bytes(bytes.fromhex('0101010101010101010102020202020202020202030303030303030303030404'))
public_key = private_key.xonly_pub
print('private_key', private_key)
print('public_key', public_key)

step0 = load_step_data('01_CHALLENGE_VIC.txt')

script = step0.script # CScript([public_key, OP_CHECKSIG], name="script")
#script = CScript(bytes.fromhex(step0.program), name="script")
# tree = TaprootScriptTree([script])
# tree.set_internal_pubkey(CCoinKey.from_secret_bytes(bytes([7]*32)).xonly_pub)
tree = step0.taproot_tree

addr = P2TRCoinAddress.from_script_tree(tree)
sPK = addr.to_scriptPubKey()

fubar_tree = TaprootScriptTree([CScript([], name="script")])
fubar_tree.set_internal_pubkey(CCoinKey.from_secret_bytes(bytes([6]*32)).xonly_pub)
fubar_addr = P2TRCoinAddress.from_script_tree(fubar_tree)
fubar_sPK = fubar_addr.to_scriptPubKey()

print("Step -1: Fund 00_INITIAL wallet")
initial_utxo_txid = wallet.send(
    amount_btc=Decimal('0.1'),
    receiver=addr
)

initial_utxo_vout = rpc.find_vout_index(initial_utxo_txid, addr)

rpc.mine_blocks()

# final_address = wallet.get_new_address()
# final_address_start_balance = rpc.get_address_balance(final_address)
# assert final_address_start_balance == 0, \
#     f"Initial balance of address {final_address} is {final_address_start_balance}, expected 0"

# start_mining(rpc, interval=2.0)

utxo_response = rpc.scantxoutset(address=addr)
assert len(utxo_response["unspents"]) >= 1, f"Expected 1 UTXO, got {len(utxo_response['unspents'])}"
utxo = utxo_response["unspents"][0]
input_amount_sat = int(utxo["amount"] * 10**8)
print('input_amount_sat', input_amount_sat)

outpoint = COutPoint(bytes.fromhex(utxo["txid"])[::-1], utxo["vout"])
vin = [CTxIn(prevout=outpoint, nSequence=0xffffffff)]
vout = [CTxOut(input_amount_sat - 100000, fubar_sPK)]
tx = CMutableTransaction(vin, vout, nVersion=2)

s, cb = tree.get_script_with_control_block('script')
sh = s.sighash_schnorr(tx, 0, [CTxOut(input_amount_sat, sPK)])
signature = private_key.sign_schnorr_no_tweak(sh)

witness_elems = step0.witness_elems
witness_elems[len(witness_elems) - 1] = signature

tx.wit.vtxinwit[0] = wit = CTxInWitness(CScriptWitness(
    witness_elems +
    [s, cb]))
print(wit)
tx.wit.vtxinwit[0] = wit2 = step0.get_witness_with_signature(tx, 0, spent_outputs=[
    CTxOut(input_amount_sat, sPK)
])
print(wit2)
assert wit == wit2

# # create a tx with the signature in it
# witness = CBitcoinTxInWitness(CScriptWitness(
#     witness_elems +
#     [ bytes.fromhex(step0.program) ] +
#     [ step0.control_block ] ))
# tx.wit.vtxinwit[0] = witness

# check tx
print(tx.serialize().hex())
mempoolaccept = rpc.call('testmempoolaccept', [tx.serialize().hex()])
print(mempoolaccept)
if not mempoolaccept[0]["allowed"]:
    reason = mempoolaccept[0]["reject-reason"]
    print(f"FAIL: testmempoolaccept failed with reason {reason}")

