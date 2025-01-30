import sys
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
    parser.add_argument('--pad-to',
                        choices=['even', 'power-of-2', 'none'],
                        default='power-of-2')
    args = parser.parse_args()

    if args.leaves <= 0:
        raise ValueError('leaves must be greater than 0')

    if args.pad_to == 'even':
        padded_tree_size = args.leaves + args.leaves % 2
    elif args.pad_to == 'power-of-2':
        padded_tree_size = 2 ** math.ceil(math.log2(args.leaves))
    else:
        padded_tree_size = args.leaves

    # Print stuff to sys.stderr to only have the test vector in stdout
    print(
        "Creating a taproot script tree with {} leaves given, {} leaves with padding (padded to {})".format(
            args.leaves, padded_tree_size, args.pad_to
        ),
        file=sys.stderr
    )

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
    print("Tree:", file=sys.stderr)
    print(taptree, file=sys.stderr)

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

    print("\nTest vector:", file=sys.stderr)
    print(json.dumps(test_vector, indent=2))


if __name__ == '__main__':
    main()