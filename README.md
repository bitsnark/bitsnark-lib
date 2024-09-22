# BitSNARK Playground

The BitSNARK protocol is a method of verifying the execution of a zero knowledge proof over a Bitcoin network, which allows hinging the transfer of BTC on provable external events, such as the transfer or burn of funds on another blockchain, which may be used for atomic swaps, 2-way pegging, and other cross-chain applications. It lets a prover and a verifier agree upon a program (i.e. a program that verifies a zero-knowledge proof) and prepare a bunch of Bitcoin transactions that allow the prover to publish the result of running that program on a given input (i.e. the zero-knowledge proof to be verified) within a Bitcoin transaction that includes some BTC staked on its correctness; and allow the verifier to claim that stake if and only if the result is incorrect (i.e. the supplied proof is not valid).

This repository is currently aimed at allowing anyone to run a prover-verifier demo locally, but we aim to expand it to be multi-verifier and over the network, and to use the protocol to implement 2-way pegging between Bitcoin and an ERC20 token.

## High Level Overview

We start with a prover, a verifier, and a deterministic program that verifies a zk-SNARK.

1. The prover and the verifier prepare and sign a bunch of Bitcoin transactions as specified below
2. The prover generates a proof regarding some agreed upon event
3. The prover runs the program with the proof as input
4. The prover publishes a Bitcoin transaction containing the proof and the result of the program and some BTC staked on the correctness of the result
5. The verifier sees the proof and runs the program with the proof as input
6. In case of discrepancy, the verifier can publish a challenge transaction<sup>*</sup> and claim the prover's stake if and only if the result published by the prover is shown to be incorrect
7. If this doesn't happen within an agreed-upon time window, the prover can claim his own stake back and the proof is considered valid

\* <sub>Because reacting to a challenge initiated by a verifier forces the prover to pay transaction fees for his part of the protocol, the verifier is required to add a challenge fee to the challenge transaction. This fee is transferred to the prover immediately. It should be equal to or higher than the cost of the prover's response, but significantly lower than the prover's stake.</sub>

In many cases it is possible and desirable to bind some of the protocol transactions to outputs of other, non-protocol transactions, hinging those transactions on the outcome of the protocol transactions (i.e. letting the prover unlock some previously locked funds only by supplying a proof that the verifier can not refute).

### Incentives

Note that the protocol creates a self-defeating prophecy, where provers never lie because they can be easily caught and punished, and the verifiers will never be able to claim prover stakes. This means that while the prover stake incentivizes the prover to be honest, it only incentivizes the verifiers when a prover lies, which would only happen if the prover believes that the verifier is not doing their job. If anything, the prover stake incentivizes verifier to turn a blind eye and let provers lie some of the time, only occasionally catching them, thus managing to claim a few stakes before the entire ecosystem collapses. This means that verifiers *must* have a separate incentive to keep performing the (admittedly trivial) task of verifying the correctness of executions.

This problem can be handled in different ways in different scenarios. In the case of an atomic swap, the incentive is simply the swapped tokens. In the case of a 2-way peg, the protocol can be expanded to include multiple provers who are also acting as verifiers, with the shared incentive of being able to move tokens between the two chains and keeping the system honest and healthy.

It's important to remember that neither the prover stake nor the challenge fee are meant to be a source of income for the participants. They are simply a way to ensure that the protocol is used correctly and that the participants are incentivized to act honestly.

## Challenge Resolution

Since running the entire program in a Bitcoin transaction is not feasible (the Script will be too long and the transaction too large to be included in a block by miners), the protocol implements a binary search for a contentious state of the program's execution (since the program is deterministic, any discrepancy between the published result and the verified result must include at least one such state of the execution, where the prover's and the verifier's views of the correct state differ). Once this state is identified, only the part of the program that changes it is executed in a separate transaction, and the result can be automatically checked by the Bitcoin miners.

The challenge transaction, published by the verifier, is answered by the prover with a transaction describing the state of execution up to the middle of the program. The verifier responds with a transaction that signals his approval or disapproval. If the verifier agrees with this middle state, but does not agree with the final result, a point of contention must exist in the second half of the program. If the verifier disagrees with the middle state, the point of contention must be in the first half of the program. The process is then repeated until the point of contention is identified.

At this point, both parties have committed themselves to disagreeing on a specific instruction in the program which takes two variables as input, performs some operation on them, and outputs a result. The verifier can then publish a transaction that runs the operation on the two variables, and will only be valid (as far as Bitcoin miners are concerned) if the result differs from the one published by the prover.

## Protocol Transactions

The only requirements are an agreed upon program, and a prover and verifier that have prepared keys and UTXOs to be used in this instance of the protocol. The two players then interactively prepare and sign the following Bitcoin transactions:



## Initial Setup

```sh
npm install
```

## Running the tests

```sh
npm test
```

## Linting the Code

WARNING: This will automatically fix linting errors.

```sh
npm run lint
```

## Future Plans

- [ ] Get this repo to the point where it can be opened to the public and allow them to run a prover-verifier demo locally
- [ ] Make that multi-verifier and over the network
- [ ] Use the protocol to implement 2-way pegging between Bitcoin and an ERC20 token
