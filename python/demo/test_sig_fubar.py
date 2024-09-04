import bitcointx as btc
btc.allow_secp256k1_experimental_modules()
btc.select_chain_params("bitcoin/testnet")
from bitcointx.wallet import CCoinKey
from bitcointx.core import COutPoint, CTxIn, CTxOut, CMutableTransaction, CTxInWitness
from bitcointx.core.script import (CScript, OP_CHECKSIGADD, OP_CHECKSIG, OP_NUMEQUAL,
                                   TaprootScriptTree, CScriptWitness)
from bitcointx.wallet import P2TRCoinAddress
from binascii import hexlify, unhexlify

# phase 1: create an address for a script of OP_CHECKSIGADD pub1, pub2/OP_CHECKSIGADD pub3, pub4/pub5

# generate 5 different privkeys:
keys = [CCoinKey.from_secret_bytes(bytes([i]*32)) for i in range(1, 6)]
scr1 = CScript([keys[0].xonly_pub, OP_CHECKSIG, keys[1].xonly_pub, OP_CHECKSIGADD, 2, OP_NUMEQUAL], name="multisig1")
scr2 = CScript([keys[2].xonly_pub, OP_CHECKSIG, keys[3].xonly_pub, OP_CHECKSIGADD, 2, OP_NUMEQUAL], name="multisig2")
scr3 = CScript([keys[4].xonly_pub, OP_CHECKSIG], name="single key")
# TaprootScriptTree automatically creates the tree for us, given a list of CScript objects:
tree = TaprootScriptTree([scr1, scr2, scr3])
# set a dummy internal pubkey; note in future we might want to use the provably unspendable form as in BIP341 recommendation:
tree.set_internal_pubkey(CCoinKey.from_secret_bytes(bytes([6]*32)).xonly_pub)
addr = P2TRCoinAddress.from_script_tree(tree)
# (this was run before completing the rest of the script to fund:)
print("The address to fund is: {}".format(addr))
# this transaction funds the above with 0.01 coins:
hextx1 = "02000000000102198b3500bfb5264bf4e782b857d0f0f897e3ca26a35c441b51059fe6b81350f10100000000feffffff905be7600b8c4fd1cac0937f17f3e2f8dfdba2062e413eb4be2a5fbfb8aaa7f20200000000feffffff0240420f000000000022512033efb169849874c88f60edb29cbe6e612c2f84e0fd6e1c5b0737cf69973e01958d82030000000000160014b847d36a181d996499836b5c2d05fad5d6b0111002473044022019f08a15f217eac47fe18862a4996e9e6818e94c0be98f54402f67e9d95ea54202203e8a3864238cad87efe8e547617ad6ee843ebf0d38f9ef1b5bdcfd517f473e180121025da8ce82bc23bba542155aaa2774e65f86a19b01502eb8fc05c72ad3d9e06e690247304402201398d6f9a41ff5c2959ebf6133f4d93aabebbd17af95febdc377b87ca763a196022048624afd49d0e27d435d57a6a73f9c5681d65e19b84f508e6df023d67ebf032c0121023fc390fb03735dfe14d48edec7bf5e6c06868a46941cdb5f88a1b7da9ad0fcdf4eff0000"
tx1id = unhexlify("18e1602c29fc063a24973179d244b1e09443fb396553e99038617084898c0c5c")
outpoint = COutPoint(tx1id[::-1], 0)

vin = [CTxIn(prevout=outpoint, nSequence=0xffffffff)]
sPK = addr.to_scriptPubKey()
vout = [CTxOut(998000, sPK)]
tx2 = CMutableTransaction(vin, vout, nVersion=2)
print(tx2)
# phase 2: given a transaction (tx1) in hex which funds an output for addr addr1, we construct a transaction spending that (tx2).
# we use the second of the three scripts:
s, cb = tree.get_script_with_control_block('multisig2')
sh = s.sighash_schnorr(tx2, 0, (CTxOut(1000000, sPK),))
sig_for_key_2 = keys[2].sign_schnorr_no_tweak(sh)
print(hexlify(sig_for_key_2))
print()
print("Verificationresult: ", keys[2].xonly_pub.verify_schnorr(sh, sig_for_key_2))
print(len(sig_for_key_2))
print()
sig_for_key_3 = keys[3].sign_schnorr_no_tweak(sh)
tx2.wit.vtxinwit[0] = CTxInWitness(CScriptWitness([sig_for_key_3, sig_for_key_2, s, cb]))
print(tx2)
print(hexlify(tx2.serialize()))