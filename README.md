# BitSNARK Playground

The BitSNARK protocol is a method of verifying the execution of a zero knowledge proof over a Bitcoin network, which allows hinging the transfer of BTC on provable external events such as the transfer or burn of funds on another blockchain. This can be used for atomic swaps, 2-way pegging, and other cross-chain applications.

The protocol involves a prover and a verifier agreeing upon a program (i.e. a program that verifies a zero-knowledge proof) and preparing a bunch of Bitcoin transactions that allow the prover to publish the result of running that program on a given input (i.e. the zero-knowledge proof to be verified) within a Bitcoin transaction that includes some BTC staked on its correctness; and allow the verifier to claim that stake if and only if the result is incorrect (i.e. the supplied proof is not valid).

This repository is currently aimed at allowing anyone to run a prover-verifier demo locally, but we aim to expand it to be multi-verifier and over the network, and to use the protocol to implement 2-way pegging between Bitcoin and an ERC20 token.

## High Level Overview

We start with a prover, a verifier, and a deterministic program that verifies a pre-determined (but yet ungenerated) zk-SNARK.

1. The prover and the verifier prepare and sign a bunch of Bitcoin transactions as specified below
2. The prover generates a proof regarding some agreed upon event
3. The prover runs the program with the proof as input
4. The prover publishes a Bitcoin transaction containing the proof and the result of the program and some BTC staked on the correctness of the result
5. The verifier sees the proof and runs the program with the proof as input
6. In case of discrepancy, the verifier can publish a challenge transaction<sup>*</sup> and claim the prover's stake if and only if the result published by the prover is shown to be incorrect
7. If this doesn't happen within an agreed-upon time window, the prover can claim his own stake back and the proof is considered valid

\* <sub>Because of the high cost of a challenge in transaction fees - a cost that will be deducted from the prover's stake even if he is honest - the verifier is required to add a fee to the challenge transaction which is transferred to the prover immediately. It should be equal to the cost incurred by the challenge, but significantly lower than the prover's stake.</sub>

In many cases it is possible and desirable to bind some of the protocol transactions to outputs of other, non-protocol transactions, hinging those transactions on the outcome of the protocol transactions (i.e. letting the prover unlock some previously locked funds only by supplying a proof that the verifier can not refute).

### Incentives

Note that the protocol creates a self-defeating prophecy, where provers never lie because they can be easily caught and punished, and the verifiers will never be able to claim prover stakes. This means that while the prover's stake incentivizes the prover to be honest, it only incentivizes the verifier if the prover lies, which can only happen if the prover believes the verifier is not doing their job. If anything, the prover stakes incentivize verifiers to turn a blind eye and motivate provers to lie, only occasionally catching and punishing them and thus managing to claim a few stakes before the entire ecosystem collapses. This means that verifiers *must* have a separate incentive to keep performing the (admittedly trivial) task of verifying the correctness of executions.

This has different solutions in different scenarios. For example, in the case of an atomic swap the incentive is simply the swapped tokens. In the case of a 2-way peg, the protocol can be expanded to include multiple provers who are also acting as verifiers, with the shared incentive of being able to move tokens between the two chains and keeping the system honest and healthy.

It's important to remember that neither the prover stake nor the verifier fee are meant to be a source of income for the participants. They are simply a way to make dishonesty very unprofitable.

## Transactions Flow

The diagram below describes the flow of transactions in the protocol with an additional "Hinged Funds" output marked with a dashed oval. Transactions publishable by the prover are green, ones publishable by the verifier are blue. Dashed lines are timelocked to a pre-specified number of blocks, the green timelock being significantly shorter than the blue one. The cyan output has a symbolic amount (1 satoshi) that is used to make the "Challenge" and "No Challenge" transactions mutually exclusive. The box labeled "Contention Bisection" is a placeholder for the process of identifying the point of contention in the program's execution which is detailed and illustrated further below.

![Transactions Flow](https://g.gravizo.com/svg?
digraph BitSnark {
    node [shape=note]
    {node [shape=point; arrowtail=none] s2 s3 s4 s4 s5}
    {node [shape=oval] "Prover Stake" "Verifier Fee" "Hinged Funds" "Prover Wallet" "Verifier Wallet"}
    {node [color=green] "Proof" "No Challenge" "Proof Accepted"}
    {node [color=blue] "Challenge" "Prover Defaulted" "Proof Refuted"}
    "Hinged Funds" [style=dashed]
    "Contention Bisection" [shape=box3d; style=bold]

    "Hinged Funds" -> s2 [arrowhead=none]
    s2 -> {"No Challenge"; "Proof Accepted"} -> "Prover Wallet"
    "Prover Stake" -> "Proof"
    "Proof" -> s3 [arrowhead=none]
    "Proof" -> s4 [arrowhead=none; color=cyan]
    s4 -> {"No Challenge"; "Challenge"} [color=cyan]
    s3 -> "No Challenge" [style=dashed; color=green]
    s3 -> s4 [arrowhead=none]
    "Verifier Fee" -> "Challenge" -> "Prover Wallet"
    s4 -> "Contention Bisection"
    s4 -> "Prover Defaulted" [style=dashed; color=blue]
    "Prover Defaulted" -> "Verifier Wallet"
    "Contention Bisection" -> s5  [arrowhead=none]
    s5 -> "Proof Refuted"
    s5 -> "Proof Accepted" [style=dashed]
    "Proof Refuted" -> "Verifier Wallet"
})
*Overview of the protocol transactions.*

Once the prover signs and publishes the "Proof" transaction, it spends the prover's stake and locks it.

If the verifier finds the proof valid, they let the green timelock expire, at which point the prover can sign and publish the "No Challenge" transaction and claim the stake back (along with any optional hinged funds).

If, however, the verifier finds the proof invalid, they publish the "Challenge" transaction, which sends the verifier's fee (along with the symbolic satoshi from the "Proof" transaction) to the prover's wallet and prevents the "No Challenge" transaction from ever being valid.

If the prover does not respond to the challenge before the blue timelock expires, the verifier can claim the prover's stake by publishing the "Prover Defaulted" transaction. To avoid this, the prover must publish the first step in the interactive "Contention Bisection" process described in the next diagram.

Once the "Contention Bisection" process is complete, the two sides have committed to disagreeing on a specific instruction in the program, i.e. on the result of some operation on two variables. At that point, if and only if the prover's version is incorrect, the verifier can publish the "Proof Refuted" transaction, claim the prover's stake, and prevent the prover from releasing any hinged funds.

If, however, the prover's version is correct, the "Proof Refuted" transaction will never be valid, the timelock will expire and the prover will be able to claim his stake back along with any hinged funds.

### Contention Bisection

Since running the entire program in a Bitcoin transaction is not feasible (the Script will be too long and the transaction too large to be included in a block by miners), the protocol implements a binary search for a contentious operation in the program's execution (since the program is deterministic, any discrepancy between the published result and the verified result must include at least one step of the execution for which the prover's and the verifier's views of the program's state differ). Once this operation is identified, it is may be executed as part of the script of a Bitcoin transaction and automatically checked by the Bitcoin miners.

The diagram below illustrates the process of identifying the contentious operation. Transactions publishable by the prover are green, ones publishable by the verifier are blue. Dashed lines are timelocked to a pre-specified number of blocks. The dotted line between "State 2" and "State n" indicates that the bisection process is repeated multiple times (it currently takes us 19 bisections to identify one out of half a million operations in our snark verification program).

![Bisection Flow](https://g.gravizo.com/svg?
digraph Bisection {
    node [shape=note]
    {node [shape=point; arrowtail=none] s1 s2 s3 s4 s5}
    {node [label="..."; shape=diamond] start end}
    {node [color=blue] "Select 1" "Select n" "Prover Defaulted 1" "Prover Defaulted n"}
    {node [color=green] "State 1" "State 2" "State n" "Verifier Defaulted 1" "Verifier Defaulted 2" "Verifier Defaulted n" "Argument"}
    start -> "State 1"
    "State 1" -> s1 [arrowhead=none]
    s1 -> "Select 1" [weight=2]
    s1 -> "Verifier Defaulted 1" [style=dashed]
    "Select 1" -> s2 [arrowhead=none]
    s2 -> "State 2" [weight=2]
    s2 -> "Prover Defaulted 1" [style=dashed]
    "State 2" -> s3 [arrowhead=none]
    s3 -> "State n" [style=dotted; weight=2]
    s3 -> "Verifier Defaulted 2" [style=dashed]
    "State n" -> s4 [arrowhead=none]
    s4 -> "Select n" [weight=2]
    s4 -> "Verifier Defaulted n" [style=dashed]
    "Select n" -> s5 [arrowhead=none]
    s5 -> "Argument" [weight=2]
    s5 -> "Prover Defaulted n" [style=dashed]
    "Argument" -> end
    end [label="..."; shape=diamond]
})
*The bisection process for identifying the point of contention in the program's execution.*

To recap, we got here because the verifier published the "Challenge" transaction, which means that the prover must publish the "State 1" transaction and lock the output of the "Proof" transaction before the second timelock (blue dashed line in the previous diagram) expires and the verifier claims it with the "Prover Defaulted" transaction. The "State 1" transaction publishes and commits to the state of the program's execution up to the middle of the program.

In response, the verifier has to publish the "Select 1" transaction before the new timelock expires and the prover claims the stake with "Prover Defaulted 1". The "Select 1" transaction signals the verifier's approval or disapproval of the state published by the prover. If the verifier disagrees with the state, a point of contention must exist in the first half of the program. If the verifier agrees with the state, but not with the final result, a point of contention must exist in the second half of the program. The process is then repeated until the point of contention is identified when the verifier publishes "Select n".

To end the bisection process, the prover publishes the "Argument" transaction, which commits to the the two variables that are the input to the contentious operation, the operation itself (as identified by the binary path that located it) and the result.

The output of the "Argument" transaction can be spent by the verifier only if the result of the operation is different from the one published by the prover. And if the verifier can't do that before the timelock expires, the prover can claim the stake back.

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
