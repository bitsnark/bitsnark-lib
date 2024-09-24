# BitSNARK Playground

The BitSNARK protocol is a method of verifying the execution of a zero knowledge proof over a Bitcoin network, which allows hinging the transfer of BTC on provable external events such as the transfer or burn of funds on another blockchain. This can be used for atomic swaps, 2-way pegging, and other cross-chain applications.

The protocol involves a prover and a verifier agreeing upon a program (i.e. a program that verifies a zero-knowledge proof) and preparing a bunch of Bitcoin transactions that allow the prover to publish the result of running that program on a given input (i.e. the zero-knowledge proof to be verified) within a Bitcoin transaction that includes some BTC staked on its correctness; and allow the verifier to claim that stake if and only if the result is incorrect (i.e. the supplied proof is not valid).

This repository is currently aimed at allowing anyone to run a prover-verifier demo locally, but we aim to expand it to be multi-verifier and over the network, and to use the protocol to implement 2-way pegging between Bitcoin and an ERC20 token, and it's almost there.

See [the whitepaper](./whitepaper.md) for a more detailed explanation of the protocol.

## High Level Overview

We start with a prover, a verifier, and a deterministic program that verifies a pre-determined (but yet ungenerated) zk-SNARK.

1. The prover and the verifier prepare and sign a bunch of Bitcoin transactions as specified below
2. The prover generates a proof regarding some agreed upon event
3. The prover runs the program with the proof as input
4. The prover publishes a Bitcoin transaction containing the proof and the result of the program and some BTC staked on the correctness of the result
5. The verifier sees the proof and runs the program with the proof as input
6. In case of discrepancy, the verifier can publish a challenge transaction<sup>*</sup> and claim the prover's stake if and only if the result published by the prover is shown to be incorrect
7. If this doesn't happen within an agreed-upon time window, the prover can claim his own stake back and the proof is considered valid

\* <sub>Because of the high cost of a challenge in transaction fees - a cost that will be deducted from the prover's stake even if he is honest - the verifier is required to add a predefined payment to the challenge transaction which is transferred to the prover immediately. It should be equal to the cost incurred by the challenge, but significantly lower than the prover's stake.</sub>

In many cases it is possible and desirable to bind some of the protocol transactions to outputs of other, non-protocol transactions, hinging those transactions on the outcome of the protocol transactions (i.e. letting the prover unlock some previously locked funds only by supplying a proof that the verifier can not refute).

### Contention Bisection

Since running the entire program in a Bitcoin transaction is not feasible (the Script will be too long and the transaction too large to be included in a block), the protocol implements a binary search for a contentious operation in the program's execution (since the program is deterministic, any discrepancy between the published result and the verified result must include at least one step of the execution for which the prover's and the verifier's views of the program's state differ). Once this operation is identified, it is may be executed as part of the script of a Bitcoin transaction and automatically checked by the Bitcoin miners.

Note this important distinction: the protocol does not verify the proof over the blockchain, but it makes it highly profitable for the verifier to do so, and therefore highly unprofitable for the prover to lie.

### Incentives

Note that the protocol creates a self-defeating prophecy, where provers never lie because they can be easily caught and punished, and the verifiers will never be able to claim prover stakes. This means that while the prover's stake incentivizes the prover to be honest, it only incentivizes the verifier if the prover lies, which can only happen if the prover believes the verifier is not doing their job. If anything, the prover stakes incentivize verifiers to turn a blind eye and motivate provers to lie, only occasionally catching and punishing them and thus managing to claim a few stakes before the entire ecosystem collapses. This means that verifiers *must* have a separate incentive to keep performing the (admittedly trivial) task of verifying the correctness of executions.

This has different solutions in different scenarios. For example, in the case of an atomic swap the incentive is simply the swapped tokens. In the case of a 2-way peg, the protocol can be expanded to include multiple provers who are also acting as verifiers, with the shared incentive of being able to move tokens between the two chains and keeping the system honest and healthy.

It's important to remember that neither the prover stake nor the verifier payment are meant to be a source of income for the participants. They are simply a way to make dishonesty very unprofitable.

## Transactions Flow

The diagram below describes the flow of transactions in the protocol with an additional "Hinged Funds" output marked with a dashed oval. Transactions publishable by the prover are green, ones publishable by the verifier are blue. Dashed lines are timelocked to a pre-specified number of blocks, the green timelock being significantly shorter than the blue one. The cyan output has a symbolic amount (1 satoshi) that is used to make the "Challenge" and "No Challenge" transactions mutually exclusive.

The dotted line between "State 1" and "State n" indicates that the bisection process is repeated multiple times (it currently takes us 19 bisections to identify one out of half a million operations in our snark verification program).

![BitSNARK Transactions Flow](./transactions-flow.svg)

Once the prover signs and publishes the "Proof" transaction, it spends the prover's stake and locks it.

If the verifier finds the proof valid, they let the green timelock expire, at which point the prover can sign and publish the "No Challenge" transaction and claim the stake back (along with any optional hinged funds).

If, however, the verifier finds the proof invalid, they publish the "Challenge" transaction, which sends the verifier's payment (along with the symbolic satoshi from the "Proof" transaction) to the prover's wallet and prevents the "No Challenge" transaction from ever being valid.

If the prover does not respond to the challenge before the blue timelock expires, the verifier can claim the prover's stake (and prevent the transfer of any hinged funds) by publishing the "Verifier Unchallenged" transaction.

To avoid this, the prover must publish the first step in the bisection process by signing and publishing the "State 0" transaction which includes the state of the program's execution up to the program's middle.

In response, the verifier has to publish the "Select 0" transaction before the new timelock expires and the prover claims the stake along with any hinged funds with "Prover Unchallenged 0". The "Select 0" transaction signals the verifier's approval or disapproval of the state published by the prover. If the verifier disagrees with the state, a point of contention must exist in the first half of the program. If the verifier agrees with the state, but not with the final result, a point of contention must exist in the second half of the program.

This process is then repeated multiple times, with the prover having to publish "State x" before the verifier publishes "Verifier Unchallenged x-1" and then the verifier having to publich "Select x" before the prover publishes "Prover Unchallenged x", until a point of contention is identified in "Select n".

The prover then must publish the "Argument" transaction, in which they commit to the two variables that are the input to the contentious operation, the operation itself (as identified by the binary path that located it) and its result.

The verifier can now claim the prover's stake and prevent the release of any hinged funds by publishing the "Proof Refuted" transaction, which is only valid if the prover's argument is incorrect.

If, however, the prover's argument is correct, the "Proof Refuted" transaction will never be valid, the timelock will expire and the prover will be able to claim his stake back along with any hinged funds using the "Proof Accepted" transaction.

## Protocol Transactions

To generate the transactions, the prover and the verifier agree on a program and prepare keys and UTXOs to be used in this instance of the protocol. The two players then interactively prepare and sign the following graph of interdependant Bitcoin transactions. These transactions are prepared and at least partially signed in advance, likely before the event that the prover will want to prove has occurred, but published only after the prover has generated his proof and is ready to publish it.

Since the transactions are linked to each other, most of the TXIDs have to be known in advance, which means that the participants can't just add inputs to pay the transaction fees (or outputs returning change from said fee). For simplicity, we assume that the prover stake includes an extra amount which pays for all the fees in case of a challenge, and that this added expense is covered by the verifier's payment on the "Challenge" transaction.

In reality, it is entirely possible for the two parties to add inputs and outputs that handle fees on any transactions along the way, as long as they are declared in advance. Moreover, we can probably use CPFP to allow the participants to add fees to fee-less transactions that are already in the mempool.

## Running the Demo

### Initial Setup

```sh
npm install
```

### Running the tests

```sh
npm test
```

## Future Plans

- [ ] Get this repo to the point where it can be opened to the public and allow them to run a prover-verifier demo locally
- [ ] Make that multi-verifier and over the network
- [ ] Use the protocol to implement 2-way pegging between Bitcoin and an ERC20 token
