# BitSNARK Playground

The BitSNARK protocol is a method of verifying a zero knowledge proof on the Bitcoin network, enabling BTC transfers to be conditional on provable external events such as the transfer or burn of funds on another blockchain. This can be used for various cross-chain application such as token swaps and 2-way pegging.

The protocol involves a prover and a verifier agreeing upon a deterministic program (i.e. a program that checks the validity of a zero-knowledge proof) and preparing a bunch of Bitcoin transactions that allow the prover to publish the result of running that program on a given input (i.e. the zero-knowledge proof to be verified) within a Bitcoin transaction that includes some BTC staked on its correctness, such that the verifier can claim that stake if and only if the result is incorrect (i.e. the supplied proof is not valid).

This repository is currently aimed at allowing anyone to run a prover-verifier demo locally, but we aim to expand it to be multi-verifier and over the network, and to use the protocol to implement 2-way pegging between Bitcoin and an ERC20 token, and it's almost there.

See [the whitepaper](/whitepaper.md) for a more detailed explanation of the protocol.

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

In many cases it is possible and desirable to bind some of the protocol transactions to outputs of other, non-protocol transactions, making them conditional on the outcome of those transactions (i.e. letting the prover unlock the funds only by supplying a proof that the verifier can not refute).

### Contention Dissection

Since running the entire program in a Bitcoin transaction is not feasible (the Script will be too long and the transaction too large to be included in a block), the protocol implements a search for a contentious operation in the program's execution (since the program is deterministic, any discrepancy between the published result and the verified result must include at least one step of the execution for which the prover's and the verifier's views of the program's state differ). Once such an operation is identified, it is may be executed as part of the script of a Bitcoin transaction and automatically checked by the Bitcoin miners.

Note this important distinction: the protocol does not validate or check the proof on the blockchain, it just makes it both possible and highly profitable for the verifier to do so, and therefore highly unprofitable for the prover to provide an invalid proof.

### Incentives

The protocol creates a self-defeating prophecy, where provers never lie because they can be easily caught and punished, and the verifiers will never be able to claim prover stakes. This means that while the prover's stake incentivizes the prover to be honest, it only incentivizes the verifier if the prover lies, which can only happen if the prover believes the verifier is not doing their job. If anything, the prover stakes incentivize verifiers to turn a blind eye and motivate provers to lie, only occasionally catching and punishing them and thus managing to claim a few stakes before the entire ecosystem collapses. This means that verifiers *must* have a separate incentive to keep performing the (admittedly trivial) task of verifying the correctness of executions.

This has different solutions in different scenarios. For example, in the case of an atomic swap the incentive is simply the swapped tokens. In the case of a 2-way peg, the protocol can be expanded to include multiple provers who are also acting as verifiers, with the shared incentive of being able to move tokens between the two chains and keeping the system honest and healthy.

It's important to remember that neither the prover stake nor the verifier payment are meant to be a source of income for the participants. They are simply a way to make dishonesty very unprofitable.

## Transactions Flow

The diagram below shows a condensed version of the transactions flow in the BitSNARK protocol with an external `Locked Funds` transaction.

![BitSNARK Transactions Flow](/analysis/transactions.collapsed.svg)

Most transactions are simple boxes, but
UTXOs that input funds into the protocol are drawn as ovals, transactions that output funds are marked with a folded corner, and protocl transactions are simple boxes. Transactions publishable by the prover are green, ones publishable by the verifier are blue, and the `Locked Funds` transaction is magenta. Dashed lines are timelocked to a pre-specified number of blocks, and gray lines are outputs that only carry a symbolic amount of satoshis (just above the dust limit) either used to make transactions mutually exclusive or to accommodate the per-input size limitations of Bitcoin transactions. For simplicity's sake, the entire dissection process is collapsed into a single node marked with a triple octagon, but below you can find a full version of the diagram with all the steps expanded (it currently takes us 5 dissections to identify one out of about half a million operations in our zk-SNARK verification program).

<details>
<summary>Expand here for a full Diagram with all the steps</summary>

![BitSNARK Full Transactions Flow](/analysis/transactions.svg)
</details>

Once the prover signs and publishes the `Proof` transaction, it spends the prover's stake and locks it.

If the verifier finds the proof valid, they let the shorter timelock expire, at which point the prover can sign and publish the `Proof Uncontested` transaction and claim the stake back (along with any optional locked funds). This transaction spends both outputs of the `Proof` transaction: the symbolic output required to publish the `Challenge` transaction (making it forever invalid) and the output that carries the prover's stake (making `Challenge Uncontested` also forever invalid).

If, however, the verifier finds the proof invalid, they publish the `Challenge` transaction, which sends the verifier's payment (along with the symbolic output from the `Proof` transaction) to the prover's wallet and prevents the `Challenge Uncontested` transaction from ever being valid.

If the prover does not respond to the challenge (or fails to publish the `Proof Uncontested` transaction when no challenge was made) before the longer timelock expires, the verifier can claim the prover's stake (and prevent the transfer of any locked funds) by publishing the `Challenge Uncontested` transaction.

To avoid this, the prover must publish the first `State` transaction, which includes the state of the program's execution at nine points, dividing the entire execution into ten segments. This transaction the remaining output from the `Proof` transaction, making it mutually exclusive with the `Challenge Uncontested` transaction.

If the verifier does not respond to the state before the timelock expires, the prover can claim the stake back along with any locked funds by publishing the first `State Uncontested` transaction.

To avoid this, the verifier must publish the first `Select` transaction, selecting one of the ten segments of the execution defined by the `State` transaction as a segment that contains a point of contention. Since the input of the program is given, and the output is contested, an honest verifier will always be able to identify at least one segment they disagree with the prover on (i.e. they accept the state before it, but not the state after it).

This state/select process is then repeated multiple times, with the prover having to publish `State n` before the verifier publishes `Select Uncontested n-1` and then the verifier having to publich `Select n` before the prover publishes `State Ucontested n`, until a single contentious instruction is identified in the last `Select` transaction.

In the condensed diagram, the dissection process is collapsed into a single node connecting the first `State` to the last `Select`, but in the full diagram it is expanded into the full 5 steps, each with its own timelock, with the prover's stake being spendable from all of the `State Uncontested` and `Select Uncontested` transactions, and with the locked funds being spendable from all of the `State Uncontested` transactions.

Once the dissection process ends with the last `Select` and the contentious operation is identified, the prover must publish the `Argument` transaction, in which they commit to the two variables that are the input to the contentious operation, the operation itself (as identified by the binary path that located it) and its result, before the timelock expires and the verifier can publish the last `Select Uncontested` transaction.

The verifier can now claim the prover's stake and prevent the release of any locked funds by publishing the `Proof Refuted` transaction, which is only valid if the prover's argument is incorrect.

If, however, the prover's argument is correct, the `Proof Refuted` transaction will never be valid, the timelock will expire and the prover will be able to claim his stake back along with any locked funds using the `Argument Uncontested` transaction.

Available is also a [TLA+ specification of the protocol](/analysis/BitSnark.pdf), including some basic invariants, all fully tested and verified using the TLA+ Toolbox.

## Multiple Verifiers

In the multi-verifier version of the protocol, we have unified the locked funds with the prover's stake, and both the `locked funds` and the `proof` transactions have separate outputs for each verifier. All of the outputs of the locked funds can be spent by a timelocked `proof accepted` transaction, returning the funds to the prover in the case of an unchallenged proof.

Each verifier can challenge the proof independently by spending his assigned `proof` output (while also paying the prover as part of the `challenge` transaction), and each challenge can lead to a state/select/argument chain possibly ending with a successful refutation. A challenge chain that ends with the verifier's victory - either through refutation or through a timeout - will also spend the verifier's matching `locked funds` output, preventing the prover from ever claiming them back and claiming a proportional part of the funds as reward.

If and only if none of the `locked funds` outputs were successfully spent, can the prover claim them back by publishing the `proof accepted` transaction.

Note that while the verifier transactions all have matching "uncontested" timelocked transactions, forcing the prover to respond with haste, the prover's transactions have no such counterparts. The prover is waiting for a global timeout to claim his funds back, and isn't incentivised to rush any of the other transactions (in fact, he is incentivised to delay them as much as possible).

The diagram below shows the flow of a single verifier's outputs from the `proof` and `locked funds` transactions (in green and magenta, respectively). Withing the challenge chain the prover's transactions are green and the verifier's are blue, except from the ones that claim the reward, which are magenta.

For simplicity, the lines connecting `locked funds` to its spenders within the challenge chain is omitted and the dissection process is shortened to two steps.

![BitSNARK Transactions Flow](/analysis/multiVerifier.svg)

## A Note About Fees

To generate the transactions, the prover and the verifier agree on a program and prepare keys and UTXOs to be used in this instance of the protocol. The two players then interactively prepare and sign the following graph of interdependant Bitcoin transactions. These transactions are prepared and at least partially signed in advance, likely before the event that the prover will want to prove has occurred, but published only after the prover has generated his proof and is ready to publish it.

Since the transactions are linked to each other, most of the TXIDs have to be known in advance, which means that the participants can't just add inputs to pay the transaction fees (or outputs returning change from said fee). For simplicity, we assume that the prover stake includes an extra amount which pays for all the fees in case of a challenge, and that this added expense is covered by the verifier's payment on the "Challenge" transaction.

In reality, it is entirely possible for the two parties to add inputs and outputs that handle fees on any transactions along the way, as long as they are declared in advance. Moreover, we can probably use CPFP to allow the participants to add fees to fee-less transactions that are already in the mempool.

## The Demo

The demo will run two agents, a prover and a verifier, that will interact with each other over a Telegram channel to create a new setup, and execute it on a local regtest Bitcoin network.

### Dependencies

You will need:
- Node.js v20.17.0
- Python 3.12
- libsecp256k1
- Docker 26 (Python tests require 27 with the docker-compose plugin)

To get all this on a fresh Ubuntu Server 24.04 install, you can run the following commands:

```sh
sudo apt-add-repository universe
sudo apt install npm python3-venv libsecp256k1-1 docker.io
sudo npm i -g n
sudo n 20.17.0
```

One you have all that, clone this repository, and from its root directory install the JS and TS dependencies:

```sh
npm install
```

### Running

Before starting, make sure you have local `.env` file setting `TELEGRAM_TOKEN_PROVER` and `TELEGRAM_TOKEN_VERIFIER` to your Telegram bot tokens, and optionally `TELEGRAM_CHANNEL_ID`. Then run the demo with:

```sh
npm run e2e
```

## Future Plans

- [ ] Make the demo multi-verifier
- [ ] Use the protocol to implement 2-way pegging between Bitcoin and an ERC20 token
