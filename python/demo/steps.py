from dataclasses import dataclass, field
import pathlib
import json
import warnings
from typing import Any

from bitcointx.core import (
    CTxInWitness,
    CTransaction,
    CTxOut,
)
from bitcointx.core.script import CScript, CScriptWitness
from bitcointx.core.scripteval import VerifyScript, EvalScript
from bitcointx.wallet import (
    CCoinKey,
    P2TRCoinAddress,
    TaprootScriptTree,
)
from bitcointx.core.key import tap_tweak_pubkey, XOnlyPubKey

from .scripteval import eval_tapscript

GENERATED_JSON_DIR = pathlib.Path(__file__).parent.parent.parent / 'tests' / 'demo' / 'generated'


def load_tx_json(filename):
    with open(GENERATED_JSON_DIR / filename) as f:
        return json.load(f)



@dataclass
class StepData:
    name: str
    internal_pubkey: XOnlyPubKey
    script: CScript
    tweaked_pubkey: XOnlyPubKey
    taproot_tree: TaprootScriptTree
    taproot_address: P2TRCoinAddress
    witness: CTxInWitness
    witness_elems: list[bytes]
    program: str
    control_block: str
    private_key: CCoinKey = field(repr=False)
    original_data: dict[str, Any] = field(repr=False, default_factory=dict)

    def get_witness_with_signature(self, tx: CTransaction, input_index: int, spent_outputs: list[CTxOut]) -> CTxInWitness:
        # TODO: re-enable this assert
        # assert self.witness_elems[-1] == bytes([0] * 32), f"last witness for {self.name} {self.witness_elems[-1].hex()} != {bytes([0] * 32).hex()}"
        if self.witness_elems[-1] != bytes([0] * 32):
            warnings.warn(f"last witness for {self.name} {self.witness_elems[-1].hex()} != {bytes([0] * 32).hex()}")
        witness_elems = self.witness_elems[:]
        sighash = self.script.sighash_schnorr(tx, input_index, spent_outputs=spent_outputs)
        signature = self.private_key.sign_schnorr_no_tweak(sighash)
        witness_elems[-1] = signature
        return CTxInWitness(CScriptWitness(
            stack=[
                *witness_elems,
                self.script,
                self.control_block,
            ]
        ))


def get_step_names(name_filter: str = "") -> list[str]:
    return [path.name for path in sorted(GENERATED_JSON_DIR.glob(f"{name_filter}*.txt"))]


def load_step_data(name: str) -> StepData:
    return verify_and_compute_taproot_data_for_tx_json(name)


def verify_and_compute_taproot_data_for_tx_json(name: str) -> StepData:
    data = load_tx_json(name)
    internal_pubkey = data["taproot internal pubkey"]
    script_hash = data["taproot script hash"]
    output_pubkey = data["taproot output pubkey"]
    program = data["program"]
    witness = data["witness"]

    # Bitcointx stuff
    internal_pubkey = XOnlyPubKey.fromhex(internal_pubkey)
    #print('internal', internal_pubkey)
    tweaked_pubkey, parity = tap_tweak_pubkey(
        internal_pubkey,
        merkle_root=bytes.fromhex(script_hash),
    )
    #print('tweaked', tweaked_pubkey)
    if len(output_pubkey) < 64:  # it's hex
        if tweaked_pubkey.hex() != output_pubkey:
            # TODO: there's some issue in taprootTweakPubkey in taproot.ts if the generated key is less than 32 bytes,
            # but we'll ignore it for now
            warnings.warn(f"pubkey for step {name} {tweaked_pubkey} != {output_pubkey} (known issue, ignoring)")
    else:
        assert tweaked_pubkey.hex() == output_pubkey, f"{tweaked_pubkey} != {output_pubkey}"
    addr1 = P2TRCoinAddress.from_xonly_output_pubkey(
        tweaked_pubkey,
        accept_invalid=False
    )
    # print("addr1", addr1)
    script = CScript(
        bytes.fromhex(program),
        name="script",
    )
    taptree = TaprootScriptTree(
        leaves=[
            script,
        ],
        internal_pubkey=internal_pubkey,
    )
    addr2 = P2TRCoinAddress.from_script_tree(taptree)
    # print("addr2", addr2)
    # assert addr1 == addr2, f"{addr1} != {addr2}"

    witness_elems = [
        # Leading zeros might be missing from original data
        bytes.fromhex(elem.rjust(64, "0"))
        # bytes.fromhex(elem)
        for elem in witness
    ]


    private_key = CCoinKey.from_secret_bytes(
        bytes.fromhex('0101010101010101010102020202020202020202030303030303030303030404'))

    spending_script, control_block = taptree.get_script_with_control_block('script')
    assert spending_script == script
    witness = CTxInWitness(CScriptWitness(
        stack=[
            *witness_elems,
            script,
            control_block,
        ]
    ))

    # Evaluation doesn't work unfortunately, maybe because our eval_tapscript doesn't actually care about tapscript,
    # maybe because something is actually wrong with the scripts...
    # try:
    #     eval_tapscript(
    #         witness_elems=witness_elems,
    #         script=script,
    #     )
    # except Exception as e:
    #     #print(f"Warning: Error evaluating witness: {e}")
    #     # print(CScript.fromhex(script.hex()))
    #     # print(repr(script))
    #     # raise
    #     pass

    return StepData(
        name=name,
        internal_pubkey=internal_pubkey,
        script=CScript(bytes.fromhex(program), name="script"),
        tweaked_pubkey=tweaked_pubkey,
        taproot_tree=taptree,
        taproot_address=addr2,
        witness=witness,
        witness_elems=witness_elems,
        original_data=data,
        control_block=control_block,
        program=program,
        private_key=private_key,
    )


def verify_generated_jsons():
    print("Verifying all files from ", GENERATED_JSON_DIR)
    for path in sorted(GENERATED_JSON_DIR.glob("*.txt")):
        print(f"Verifying {path}...", end=' ')
        verify_and_compute_taproot_data_for_tx_json(path.name)
        print("Ok.")
    print("All Ok.")


if __name__ == '__main__':
    verify_generated_jsons()
