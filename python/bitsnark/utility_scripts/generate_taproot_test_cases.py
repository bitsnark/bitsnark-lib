import json
from argparse import ArgumentParser
import math

from bitcointx.core.script import CScript, TaprootScriptTree, OP_EQUAL
from bitcointx.core.key import XOnlyPubKey
from bitcointx.wallet import P2TRCoinAddress


def main():
    parser = ArgumentParser()
    parser.add_argument('--leaves', type=int, required=True)
    parser.add_argument('--internal-pubkey', type=XOnlyPubKey.fromhex,
                        default=XOnlyPubKey.fromhex('e0dfe2300b0dd746a3f8674dfd4525623639042569d829c7f0eed9602d263e6f'))
    args = parser.parse_args()

    if args.leaves <= 0:
        raise ValueError('leaves must be greater than 0')

    # The tree will be padded to a power of 2
    padded_tree_size = 2 ** math.ceil(math.log2(args.leaves))

    leaves = []
    i = 0
    leaf = CScript([])
    while i < args.leaves:
        leaf = CScript([i, OP_EQUAL], name=str(i))
        leaves.append(leaf)
        i += 1

    while i < padded_tree_size:
        leaves.append(CScript(leaf, name=f'pad{i}'))
        i += 1

    taptree = TaprootScriptTree(
        leaves=leaves,
        internal_pubkey=args.internal_pubkey,
    )
    print("Tree:")
    print(taptree)

    hex_scripts = []
    hex_control_blocks = []
    for i in range(args.leaves):
        script, control_block = taptree.get_script_with_control_block(str(i))
        hex_scripts.append(script.hex())
        hex_control_blocks.append(control_block.hex())

    test_vector =  {
        'given': {
            'scripts': hex_scripts,
        },
        'expected': {
            'root': taptree.merkle_root.hex(),
            'scriptPubKey': P2TRCoinAddress.from_script_tree(taptree).to_scriptPubKey().hex(),
            'scriptPathControlBlocks': hex_control_blocks,
        }
    }

    print("\n")
    print("Test vector:")
    print(json.dumps(test_vector, indent=2))


if __name__ == '__main__':
    main()