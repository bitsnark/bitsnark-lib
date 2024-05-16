// const n_chunk1 = 0x3487578354897345987abbf713298017347dddcca8760987aabbbccdd9879879n;
// const n_chunk2 = 0x8abbfc987987987abb00ccd98798798ffffffbbbc908797987cccdddddaaaaaan;
// const n_root = 0x54c3f3d905082f7f3b20538aa7219eb64af6be46b7cbbaa90a779748606b9a5cn;

// const witness = createWitness([ n_chunk1, n_chunk2 ], n_root);
// const chunks = vm.initWitness(witness.hashes.flat());
// const out = makeRegisters(8);
// hash(out, chunks);

// console.log('Result: ', out.map(t => t.value.toString(16)));
// console.log(`Success: ${vm.success}   \t   Instructions: ${vm.instructions.length}   \t   Registers: ${vm.state.maxRegCount}`)

// assert(toNum(out) == n_root);

