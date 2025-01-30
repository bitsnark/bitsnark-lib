import logging
from decimal import Decimal

from bitcointx.core import CTransaction, CMutableTransaction, CTxIn, CTxOut, COutPoint, CTxInWitness
from bitcointx.core.psbt import PartiallySignedTransaction, PSBT_Input, PSBT_Output
from bitcointx.core.key import CKey
from bitcointx.core.script import CScriptWitness, CScript
from bitcointx.wallet import CCoinAddress, P2TRCoinAddress
from sqlalchemy.orm.session import Session
from sqlalchemy.orm.attributes import flag_modified

from .models import TransactionTemplate
from .parsing import serialize_hex, serialize_bignum, parse_hex_bytes, parse_bignum
from .transactions import construct_signed_transaction
from ..btc.rpc import BitcoinRPC


logger = logging.getLogger(__name__)
MIN_NON_DUST_SAT = 546
# Example values for psbt size estimation, determined empirically (might not be accurate)
MOCK_OUTPUT = CTxOut(
    nValue=MIN_NON_DUST_SAT,
    scriptPubKey=P2TRCoinAddress.from_xonly_pubkey(
        CKey.from_secret_bytes(b'1' * 32).xonly_pub
    ).to_scriptPubKey(),
)
MOCK_SCRIPT_WITNESS = CScriptWitness([b'1' * 71, b'2' * 33])


class OutOfFunds(Exception):
    pass


class AlreadyFunded(ValueError):
    pass


class NotFundable(ValueError):
    pass


def fund_tx_template_from_wallet(
    *,
    tx_template: TransactionTemplate,
    dbsession: Session,
    bitcoin_rpc: BitcoinRPC,
    test_mempoolaccept: bool = True,
    fee_rate_sat_per_vb: int | Decimal,
    change_address: str | CCoinAddress | None = None,
    lock_unspent: bool = True,
):
    """
    Fund a tx template from wallet, modifying it in place and storing results in the DB
    """
    # create_funded_transaction will complain if the template is already funded
    tx = create_funded_transaction(
        tx_template=tx_template,
        dbsession=dbsession,
        bitcoin_rpc=bitcoin_rpc,
        test_mempoolaccept=test_mempoolaccept,
        fee_rate_sat_per_vb=fee_rate_sat_per_vb,
        change_address=change_address,
        lock_unspent=lock_unspent,
    )

    for input_index, tx_input in enumerate(tx.vin):
        if input_index == 0:
            # First input is unchanged
            continue
        assert len(tx_template.inputs) == input_index
        tx_template.inputs.append({
            "funded": True,
            "index": input_index,
            "txid": tx_input.prevout.hash[::-1].hex(),
            "vout": tx_input.prevout.n,
            "witness": serialize_hex(tx.wit.vtxinwit[input_index].serialize()),
        })

    for output_index, tx_output in enumerate(tx.vout):
        if output_index == 0:
            # First output is unchanged
            continue
        assert len(tx_template.outputs) == output_index
        tx_template.outputs.append({
            "funded": True,
            "index": output_index,
            "amount": serialize_bignum(tx_output.nValue),
            # Stupidly named scriptPubKey
            "taprootKey": serialize_hex(tx_output.scriptPubKey),
        })

    tx_template.txid = tx.GetTxid()[::-1].hex()
    tx_template.unknown_txid = False
    flag_modified(tx_template, 'inputs')
    flag_modified(tx_template, 'outputs')

    dbsession.flush()


def get_signed_transaction_from_funded_tx_template(
    *,
    tx_template: TransactionTemplate,
    dbsession: Session,
) -> CTransaction:
    """
    Get a broadcastable transaction from a funded transaction template
    """
    if not tx_template.fundable:
        raise NotFundable(f"Transaction template {tx_template.name} is not fundable")

    signed_nonfunded_tx = construct_signed_transaction(
        tx_template=tx_template,
        dbsession=dbsession,
        # We'll reconstruct the originla transaction without funded inputs/outputs
        ignore_funded_inputs_and_outputs=True,
    )
    tx: CMutableTransaction = signed_nonfunded_tx.tx.to_mutable()

    if tx_template.inputs[0].get("funded"):
        raise ValueError(f"Input 0 is funded")
    if tx_template.outputs[0].get("funded"):
        raise ValueError(f"Output 0 is funded")

    for tx_input in tx_template.inputs[1:]:
        if not tx_input.get('funded'):
            raise ValueError(f"Input {tx_input['index']} is not funded")
        tx.vin.append(CTxIn(
            prevout=COutPoint(bytes.fromhex(tx_input['txid'])[::-1], tx_input['vout']),
            nSequence=0,
        ))
        tx.wit.vtxinwit.append(CTxInWitness.deserialize(parse_hex_bytes(tx_input['witness'])))

    for tx_output in tx_template.outputs[1:]:
        if not tx_output.get('funded'):
            raise ValueError(f"Output {tx_output['index']} is not funded")
        tx.vout.append(CTxOut(
            nValue=parse_bignum(tx_output['amount']),
            scriptPubKey=CScript(parse_hex_bytes(tx_output['taprootKey'])),
        ))

    txid = tx.GetTxid()[::-1].hex()
    if txid != tx_template.txid:
        raise ValueError(f"Constructed transaction has different txid {txid} than template {tx_template.txid}")

    return tx.to_immutable()


def create_funded_transaction(
    *,
    tx_template: TransactionTemplate,
    dbsession: Session,
    bitcoin_rpc: BitcoinRPC,
    test_mempoolaccept: bool = True,
    fee_rate_sat_per_vb: int | Decimal,
    change_address: str | CCoinAddress | None = None,  # Default to getting an address from the wallet
    lock_unspent: bool = True,
) -> CTransaction:
    """
    Create a broadcastable transaction from a transaction template, funding it from the wallet
    """
    if not tx_template.fundable:
        raise NotFundable(f"Transaction template {tx_template.name} is not fundable")

    if len(tx_template.inputs) != 1 or len(tx_template.outputs) != 1:
        raise AlreadyFunded(
            f"Transaction template {tx_template.name} seems to be already funded "
            f"(has {len(tx_template.inputs)} inputs and {len(tx_template.outputs)} outputs)"
        )

    signed_tx_envelope = construct_signed_transaction(
        tx_template=tx_template,
        dbsession=dbsession,
    )
    signed_nonfunded_tx = signed_tx_envelope.tx

    # Manually add the existing input (along with its witness data) and output to the PSBT
    psbt = PartiallySignedTransaction()
    psbt.add_input(signed_nonfunded_tx.vin[0], PSBT_Input(
        final_script_witness=signed_nonfunded_tx.wit.vtxinwit[0].scriptWitness,
        utxo=signed_tx_envelope.signable_tx.spent_outputs[0],
    ))
    psbt.add_output(signed_nonfunded_tx.vout[0], PSBT_Output())

    # Sanity checks -- the PSBT should match the original transaction at this point
    assert psbt.is_final()
    _tx = psbt.extract_transaction()
    assert _tx.serialize() == signed_nonfunded_tx.serialize()
    del _tx

    # Coin selection
    # We default to coins with most confirmations (oldest coins) first
    include_unsafe = False
    available_utxos = bitcoin_rpc.call('listunspent', 0, 9999999, [], include_unsafe)
    available_utxos.sort(key=lambda u: u['confirmations'], reverse=True)

    lockable_utxos = []
    while True:
        psbt_size = estimate_funded_psbt_size_vb(psbt)
        required_fee = int(fee_rate_sat_per_vb * psbt_size)
        psbt_fee = psbt.get_fee(allow_negative=True)

        logger.debug(
            "Estimated PSBT size: %d vB, req fee: %d sat, fee: %d sat",
            psbt_size,
            required_fee,
            psbt_fee,
        )

        if psbt_fee >= required_fee:
            break
        try:
            utxo = available_utxos.pop(0)
        except IndexError:
            raise OutOfFunds(f"Ran out of available UTXOs when trying to fund {tx_template.name}")

        logger.debug("Adding UTXO %s:%d to fund %s", utxo['txid'], utxo['vout'], tx_template.name)

        prev_outpoint = COutPoint(bytes.fromhex(utxo['txid'])[::-1], utxo['vout'])
        prev_output = bitcoin_rpc.get_output(prev_outpoint)
        psbt.add_input(
            CTxIn(
                prevout=prev_outpoint,
                nSequence=0,
            ),
            PSBT_Input(
                utxo=prev_output,  # This argument might not be necessary
            ),
        )
        lockable_utxos.append({
            "txid": utxo['txid'],
            "vout": utxo['vout'],
        })

    change_sat = psbt_fee - required_fee
    logger.debug("Change amount sat: %d", change_sat)
    if change_sat > MIN_NON_DUST_SAT:
        if change_address is None:
            change_address = bitcoin_rpc.call('getnewaddress')
            logger.info("Using change address from wallet %s", change_address)
            change_address = CCoinAddress(change_address)
        elif isinstance(change_address, str):
            change_address = CCoinAddress(change_address)
        psbt.add_output(
            CTxOut(
                nValue=change_sat,
                scriptPubKey=change_address.to_scriptPubKey(),
            ),
            PSBT_Output(),
        )

    # Process the PSBT using the bitcoin wallet. This will add signatures to recently added inputs
    process_psbt_response = bitcoin_rpc.call('walletprocesspsbt', psbt.to_base64())
    if not process_psbt_response['complete']:
        raise ValueError(f"PSBT from walletprocesspsbt not complete: {process_psbt_response}")
    final_psbt = PartiallySignedTransaction.from_base64(process_psbt_response['psbt'])
    assert final_psbt.is_final()

    # Lock used UTXOs to prevent accidental double-spending, if so requested
    if lock_unspent:
        logger.debug("Locking utxos: %s", lockable_utxos)
        bitcoin_rpc.call('lockunspent', False, lockable_utxos)

    # Extract the raw bitcoin transaction from the PSBT and optionally test that it can be accepted to the mempool
    tx = final_psbt.extract_transaction()
    if test_mempoolaccept:
        bitcoin_rpc.test_mempoolaccept(tx.serialize().hex())

    return tx


def estimate_funded_psbt_size_vb(
    psbt: PartiallySignedTransaction,
    *,
    add_change: bool = True,
) -> int:
    """
    Estimate the virtual size of a PSBT that is being funded (for fee calculation).

    As the witness data of all inputs is not known, this is not necessarily 100% correct.
    """
    estimated_psbt = PartiallySignedTransaction()

    # Add outputs, these should already have all the data needed
    for tx_output, psbt_output in zip(psbt.unsigned_tx.vout, psbt.outputs):
        estimated_psbt.add_output(
            tx_output,
            psbt_output,
        )

    # Add inputs. For inputs that don't have witness data (i.e. no signatures), default to the mock witness
    for tx_input, orig_psbt_input in zip(psbt.unsigned_tx.vin, psbt.inputs):
        if orig_psbt_input.final_script_witness.is_null():
            final_script_witness = MOCK_SCRIPT_WITNESS
        else:
            final_script_witness = orig_psbt_input.final_script_witness
        if orig_psbt_input.utxo is None:
            utxo = MOCK_OUTPUT
        else:
            utxo = orig_psbt_input.utxo
        psbt_input = PSBT_Input(
            final_script_witness=final_script_witness,
            utxo=utxo,
        )
        estimated_psbt.add_input(
            tx_input,
            psbt_input,
        )

    if add_change:
        estimated_psbt.add_output(
            MOCK_OUTPUT,
            PSBT_Output(),
        )

    return estimated_psbt.extract_transaction().get_virtual_size()
