import sys
import json
import time
from argparse import ArgumentParser
import math
from typing import Sequence, Tuple, Callable, List, Optional

import bitcointx
from bitcointx.core.script import CScript, TaprootScriptTree, OP_EQUAL, TaprootScriptTreeLeaf_Type, BytesSerializer
from bitcointx.core.key import XOnlyPubKey
from bitcointx.wallet import P2TRCoinAddress


class TapLeafHash(bytes):
    def __new__(cls, value: bytes = b'',
                *, name: Optional[str] = None,
                ):
        instance = super().__new__(cls, value)
        instance._name = name
        return instance

    @property
    def name(self) -> str | None:
        return getattr(self, '_name', None)


class ForkedTaprootScriptTree(TaprootScriptTree):
    """
    A TaprootScriptTree where you can pass in TapLeafHash objects as leaves (to avoid storing a humongous amount
    of scripts in memory)
    """
    def _traverse(
        self,
        leaves: Sequence[TaprootScriptTreeLeaf_Type]
    ) -> Tuple[bytes, Callable[[Tuple[bytes, ...]], List[Tuple[bytes, ...]]]]:
        if len(leaves) == 1:
            leaf = leaves[0]
            if isinstance(leaf, TapLeafHash):
                leaf_hash = leaf
                return (
                    leaf_hash,
                    lambda parent_path: [(b'', ) + parent_path]
                )
            elif isinstance(leaf, CScript):
                leaf_hash = bitcointx.core.CoreCoinParams.tapleaf_hasher(
                    bytes([self.leaf_version])
                    + BytesSerializer.serialize(leaf))
                return (
                    leaf_hash,
                    lambda parent_path: [(b'', ) + parent_path]
                )
            elif isinstance(leaf, TaprootScriptTree):
                if len(leaf._leaves_with_paths) == 1:
                    assert isinstance(
                        leaf._leaves_with_paths[0][0], CScript
                    ), ("Single TaprootScriptTree leaf within another tree is "
                        "meaningless and constructing such TaprootScriptTree "
                        "should have raisen an error")

                    # Treat TaprootScriptTree that contains a single script
                    # as the script itself
                    path = b''
                else:
                    path = leaf.merkle_root

                return (
                    leaf.merkle_root,
                    lambda parent_path: [(path, ) + parent_path]
                )

            raise ValueError(
                f'Unrecognized type for the leaf: {type(leaf)}')

        split_pos = len(leaves) // 2
        left = leaves[:split_pos]
        right = leaves[split_pos:]

        left_h, left_collector = self._traverse(left)
        right_h, right_collector = self._traverse(right)

        def collector(
            parent_path: Tuple[bytes, ...]
        ) -> List[Tuple[bytes, ...]]:
            lp = left_collector((right_h, ) + parent_path)
            rp = right_collector((left_h, ) + parent_path)
            return lp + rp

        tbh = bitcointx.core.CoreCoinParams.tapbranch_hasher

        if right_h < left_h:
            branch_hash = tbh(right_h + left_h)
        else:
            branch_hash = tbh(left_h + right_h)

        return (branch_hash, collector)

    def get_control_block(self, name: str) -> bytes | None:
        """Return the control block for the script/leaf with the supplied name.
        If the script or leaf with that name is not found in the tree, None will be returned
        """

        if not self.internal_pubkey:
            raise ValueError(f'This instance of {self.__class__.__name__} '
                             f'does not have internal_pubkey')

        assert self.parity is not None

        result = self._get_script_or_hash_with_path_and_leaf_version(name)
        if result:
            _, mp, lv = result
            return bytes([lv + self.parity]) + self.internal_pubkey + mp

        return None

    def _get_script_or_hash_with_path_and_leaf_version(
        self, name: str
    ) -> Optional[Tuple[CScript, bytes, int]]:
        """Return a tuple of (script, merkle_path, leaf_version) for the script
        with with the supplied name. If the script with that name is not found
        in the tree, None will be returned

        If the leaf corresponding to name was supplied as a TapLeafHash, the
        first element of the tuple will be the TapLeafHash instead of a script.

        This is mostly useful for internal purposes
        """

        for leaf, path in self._leaves_with_paths:
            if isinstance(leaf, (CScript, TapLeafHash)) and leaf.name == name:
                return leaf, b''.join(path), self.leaf_version
            elif isinstance(leaf, TaprootScriptTree):
                if hasattr(leaf, '_get_script_or_hash_with_path_and_leaf_version'):
                    result = leaf._get_script_or_hash_with_path_and_leaf_version(name)
                else:
                    result = leaf.get_script_with_path_and_leaf_version(name)
                if result:
                    return (result[0],
                            result[1] + b''.join(path[1:]),
                            result[2])

        return None

    @classmethod
    def parallel_create(
        cls,
        leaves,
        *,
        num_threads: int = 16,
        **kwargs,
    ):
        import concurrent.futures


        if len(leaves) % num_threads != 0:
            raise ValueError(
                f"Number of leaves ({len(leaves)}) must be divisible by num_threads ({num_threads})"
            )
        leaves_per_thread = len(leaves) // num_threads

        # We actually use processes instead of threads because of the GIL
        with concurrent.futures.ProcessPoolExecutor(max_workers=num_threads) as executor:
            futures = []
            for i in range(num_threads):
                start = i * leaves_per_thread
                end = start + leaves_per_thread
                futures.append(
                    executor.submit(
                        cls,
                        leaves[start:end],
                        **kwargs,
                    )
                )

            results = [f.result() for f in futures]
        return cls(
            leaves=results,
            **kwargs,
        )


# The file we care about is
# compressor-results-1736955278090.json

def main():
    parser = ArgumentParser()
    parser.add_argument('results_file', type=str,
                        help='The file containing the results of the compressor, newline separated jsons')
    parser.add_argument('--internal-pubkey', type=XOnlyPubKey.fromhex,
                        default=XOnlyPubKey.fromhex('0000000000000000000000000000000000000000000000000000000000000001'))
    parser.add_argument('--pad-to',
                        choices=['power-of-2', 'even', 'none'],
                        default='power-of-2',
                        help='Padding style of the tree. The TS Compressor class uses power-of-2')
    parser.add_argument('--debug', action='store_true',
                        help='Drop into the python debugger after creating the taptree')
    parser.add_argument('--parallel', action='store_true', default=False)
    args = parser.parse_args()

    hex_hashes = []
    print(f"Reading {args.results_file}")
    requested_script = None
    with open(args.results_file) as f:
        for line in f:
            if not line.strip():
                continue
            result = json.loads(line)
            hex_hashes.extend(result['hashes'])
            requested_script_in_result = result.get('requestedScript')
            if requested_script_in_result:
                print("Requested script found")
                if requested_script is not None:
                    raise ValueError("Multiple requested scripts found")
                requested_script = CScript.fromhex(requested_script_in_result)

    if requested_script:
        print("Finding index of requested script")
        # This is the default version that's used by TaprootScriptTree
        leaf_version = bitcointx.core.CoreCoinParams.TAPROOT_LEAF_TAPSCRIPT
        requested_script_hash = bitcointx.core.CoreCoinParams.tapleaf_hasher(
            bytes([leaf_version])
            + BytesSerializer.serialize(requested_script))
        print("Requested script hash:", requested_script_hash.hex())
        requested_script_index = hex_hashes.index(requested_script_hash.hex())
        print("Requested script index:", requested_script_index)
    else:
        print("No requested script found")
        requested_script_index = -1

    num_hashes = len(hex_hashes)
    print("Number of hashes:", num_hashes)
    print("Number of unique hashes:", len(set(hex_hashes)))
    if args.pad_to == 'power-of-2':
        padded_tree_size = 2 ** math.ceil(math.log2(num_hashes))
    elif args.pad_to == 'even':
        padded_tree_size = num_hashes + num_hashes % 2
    else:
        padded_tree_size = num_hashes

    print("Padded tree size:", padded_tree_size)
    if padded_tree_size > num_hashes:
        last_hash = hex_hashes[-1]
        print("Padding with last hash:", last_hash)
        padding_size = padded_tree_size - num_hashes
        hex_hashes.extend([last_hash] * padding_size)

    print("Creating leaves")
    leaves = [TapLeafHash(bytes.fromhex(h), name=str(i)) for i, h in enumerate(hex_hashes)]
    print("Taptree creation starts now")
    start_time = time.time()
    if args.parallel:
        print("Using parallel creation")
        taptree = ForkedTaprootScriptTree.parallel_create(
            leaves=leaves,
            internal_pubkey=args.internal_pubkey,
        )
    else:
        taptree = ForkedTaprootScriptTree(
            leaves=leaves,
            internal_pubkey=args.internal_pubkey,
        )
    duration = time.time() - start_time
    print(f"Taptree created in {duration:.2f} seconds")
    print("Merkle root:", taptree.merkle_root.hex())
    print("ScriptPubKey:", P2TRCoinAddress.from_script_tree(taptree).to_scriptPubKey().hex())
    if requested_script_index >= 0:
        control_block = taptree.get_control_block(str(requested_script_index))
        # print("Requested script:", script.hex())
        print("Control block:", control_block.hex())
    if args.debug:
        breakpoint()
        pass


if __name__ == '__main__':
    main()