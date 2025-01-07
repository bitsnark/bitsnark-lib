import logging
from decimal import Decimal

import pytest
from bitcointx.core import script, CTxIn, CTxOut, CMutableTransaction, CTxWitness, CTxInWitness
from bitcointx.core.key import CKey, XOnlyPubKey
from bitcointx.core.script import CScript, TaprootScriptTree, CScriptWitness
from bitcointx.wallet import P2TRCoinAddress

from bitsnark.btc.rpc import BitcoinRPC
from bitsnark.core.signing import sign_input
from tests.utils.bitcoin_wallet import BitcoinWallet

pytestmark = pytest.mark.usefixtures('docker_compose')
logger = logging.getLogger(__name__)


INTERNAL_PUBKEY = XOnlyPubKey.fromhex('0000000000000000000000000000000000000000000000000000000000000001')
PRIVKEY_A = CKey.fromhex('415c69b837f4146019574f59c223054c8c144ac61b6ae87bc26824c0f8d034e2')
# PUBKEY_A = PRIVKEY_A.xonly_pub
PRIVKEY_B = CKey.fromhex('d4067af1132afcb352b0edef53d8aa2a5fc713df61dee31b1d937e69ece0ebf0')
# PUBKEY_B = PRIVKEY_B.xonly_pub


def test_sighash(
    # dbsession_prover: sa.orm.Session,
    # dbsession_verifier: sa.orm.Session,
    btc_rpc: BitcoinRPC,
    btc_wallet: BitcoinWallet,
):
    multisig_taptree = TaprootScriptTree(
        leaves=[
            CScript(
                [
                    PRIVKEY_B.xonly_pub,
                    script.OP_CHECKSIGVERIFY,
                    PRIVKEY_A.xonly_pub,
                    script.OP_CHECKSIGVERIFY,
                    script.OP_1,
                ],
                name='multisig'
            ),
        ],
        internal_pubkey=INTERNAL_PUBKEY,
    )
    multisig_tap_address = P2TRCoinAddress.from_script_tree(multisig_taptree)

    funded_amount_btc = Decimal('0.123')
    funding_outpoint = btc_wallet.send(
        amount_btc=funded_amount_btc,
        receiver=multisig_tap_address,
    )
    btc_wallet.mine()

    spent_outputs = [
        btc_wallet.get_output(funding_outpoint),
    ]

    tx = CMutableTransaction(
        vin=[
            CTxIn(prevout=funding_outpoint),
        ],
        vout=[
            CTxOut(
                nValue=int(funded_amount_btc * 10**8 * Decimal('0.9')),
                scriptPubKey=multisig_tap_address.to_scriptPubKey(),
            ),
        ],
    )

    tapscript, cblock = multisig_taptree.get_script_with_control_block('multisig')

    # TODO: changing hashtype makes it fail
    # hashtype = script.SIGHASH_SINGLE
    hashtype = None

    sig_a = sign_input(
        script=tapscript,
        tx=tx,
        input_index=0,
        spent_outputs=spent_outputs,
        private_key=PRIVKEY_A,
        hashtype=hashtype,
    )
    sig_b = sign_input(
        script=tapscript,
        tx=tx,
        input_index=0,
        spent_outputs=spent_outputs,
        private_key=PRIVKEY_B,
        hashtype=hashtype,
    )
    tx.wit = CTxWitness(
        vtxinwit=[
            CTxInWitness(
                CScriptWitness(
                    stack=[
                        sig_a,
                        sig_b,
                        tapscript,
                        cblock,
                    ]
                )
            ),
        ],
    )

    btc_rpc.test_mempoolaccept(tx)
