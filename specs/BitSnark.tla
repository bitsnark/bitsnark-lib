------------------------------ MODULE BitSnark ------------------------------
(***************************************************************************)
(* This module specifies the transaction flow in the BitSNARK protocol.    *)
(***************************************************************************)

EXTENDS Naturals, FiniteSets

CONSTANTS
    PROGRAM_SIZE,  (* The size of the verification program. *)
    PROVER_STAKE,  (* Size of the prover stake. *)
    VERIFIER_PAYMENT  (* Size of the verifier payment. *)

VARIABLES
    outputs,  (* The set of all currently spendable outputs. *)
    balances,  (* Balances of the participants and contracts. *)
    contentioned  (* The number of contentioned instructions. *)

Transactions ==  (* The set of protocol transactions. *)
    [Proof |-> [
        inputs |-> {"Stakable Funds"},
        outputs |-> {"Proof Value", "Proof Signal"}],
    ProofUncontested |-> [
        inputs |-> {"Proof Value", "Proof Signal", "Locked Funds"},
        outputs |-> {"Proof Uncontested"}],
    Challenge |-> [
        inputs |-> {"Payable Funds", "Proof Signal"},
        outputs |-> {"Challenge"}],
    ChallengeUncontested |-> [
        inputs |-> {"Proof Value"},
        outputs |-> {"Challenge Uncontested"}],
    FirstState |-> [
        inputs |-> {"Proof Value"},
        outputs |-> {"State"}],
    SubsequentState |-> [
        inputs |-> {"Select"},
        outputs |-> {"State"}],
    StateUncontested |-> [
        inputs |-> {"State", "Locked Funds"},
        outputs |-> {"State Uncontested"}],
    Select |-> [
        inputs |-> {"State"},
        outputs |-> {"Select"}],
    SelectUncontested |-> [
        inputs |-> {"Select"},
        outputs |-> {"Select Uncontested"}],
    Argument |-> [
        inputs |-> {"Select"},
        outputs |-> {"Argument"}],
    ArgumentUncontested |-> [
        inputs |-> {"Argument", "Locked Funds"},
        outputs |-> {"Argument Uncontested"}],
    ProofRefuted |-> [
        inputs |-> {"Argument"},
        outputs |-> {"Proof Refuted"}]]

StartingBalances ==
    (* Nothing is staked. *)
    (* Prover has funds to stake and unlock funds. *)
    (* Verifier has funds to pay for a challenge and win the stake. *)
    [staked |-> 0,
     prover |-> PROVER_STAKE,
     verifier |-> VERIFIER_PAYMENT]

IsProofValid == CHOOSE v \in {TRUE, FALSE} : TRUE

Init ==
    /\ outputs = {"Stakable Funds", "Payable Funds", "Locked Funds"}
    /\ balances = StartingBalances
    /\ contentioned = PROGRAM_SIZE


(* State Changers. *)

Publish(transaction) ==
    /\ transaction.inputs \subseteq outputs
    /\ outputs' = (outputs \ transaction.inputs) \union transaction.outputs

Transfer(from, to, amount) ==
    balances' = [
        balances EXCEPT
        ![from] = @ - amount,
        ![to] = @ + amount]

ContentionDissection ==
    (* Divide the contentioned segment into ten subsegments, dividing the *)
    (* remainder between as many segments as necessary. Then set the size of *)
    (* the new contentioned segment to the size of first subsegment, which *)
    (* will always be at least as large as any of the other subsegments. *)
    (* And yes, this is practically the same as: *)
    (* contentioned' = (contentioned + 9) ÷ 10 *)
    contentioned' = Cardinality({i \in 1..contentioned : i % 10 = 1})


(* Transaction Functions - the steps taken from one state to the next. *)

Proof ==
    /\ Publish(Transactions["Proof"])
    /\ Transfer("prover", "staked", PROVER_STAKE)
    /\ UNCHANGED contentioned

ProofUncontested ==
    /\ Publish(Transactions["ProofUncontested"])
    /\ Transfer("staked", "prover", PROVER_STAKE)
    /\ UNCHANGED contentioned

Challenge ==
    (* A smart verifier will test for an existing state transaction, *)
    (* but smart verifiers aren't a part of the spec. *)
    /\ Publish(Transactions["Challenge"])
    /\ Transfer("verifier", "prover", VERIFIER_PAYMENT)
    /\ UNCHANGED contentioned

ChallengeUncontested ==
    /\ Publish(Transactions["ChallengeUncontested"])
    /\ Transfer("staked", "verifier", PROVER_STAKE)
    /\ UNCHANGED contentioned

State ==
    /\ contentioned > 1
    /\ (IF contentioned = PROGRAM_SIZE THEN
            (* A smart prover will test for an existing challenge, *)
            (* but smart provers aren't a part of the spec either. *)
            Publish(Transactions["FirstState"])
        ELSE
            Publish(Transactions["SubsequentState"]))
    /\ UNCHANGED balances
    /\ UNCHANGED contentioned

StateUncontested ==
    /\ Publish(Transactions["StateUncontested"])
    /\ Transfer("staked", "prover", PROVER_STAKE)
    /\ UNCHANGED contentioned

Select ==
    /\ contentioned > 1
    /\ Publish(Transactions["Select"])
    /\ ContentionDissection
    /\ UNCHANGED balances

SelectUncontested ==
    /\ Publish(Transactions["SelectUncontested"])
    /\ Transfer("staked", "verifier", PROVER_STAKE)
    /\ UNCHANGED contentioned

Argument ==
    /\ contentioned = 1
    /\ Publish(Transactions["Argument"])
    /\ UNCHANGED contentioned
    /\ UNCHANGED balances

ArgumentUncontested ==
    /\ Publish(Transactions["ArgumentUncontested"])
    /\ Transfer("staked", "prover", PROVER_STAKE)
    /\ UNCHANGED contentioned

ProofRefuted ==
    /\ IsProofValid = FALSE
    /\ Publish(Transactions["ProofRefuted"])
    /\ Transfer("staked", "verifier", PROVER_STAKE)
    /\ UNCHANGED contentioned

Next ==
    \/ Proof
    \/ ProofUncontested
    \/ Challenge
    \/ ChallengeUncontested
    \/ State
    \/ StateUncontested
    \/ Select
    \/ SelectUncontested
    \/ Argument
    \/ ArgumentUncontested
    \/ ProofRefuted

vars == <<outputs, balances, contentioned>>

Spec ==
        /\ Init
        /\ [][Next]_vars
        /\ WF_vars(Next)


(* Data Extraction. *)

AllowedOutputs ==
    UNION {
        Transactions[name].inputs
            \cup
        Transactions[name].outputs :
            name \in DOMAIN Transactions}

Sum(balancesRecord) ==
    balancesRecord["staked"] +
    balancesRecord["prover"] +
    balancesRecord["verifier"]


(* Safety Properties. *)

OutputsTypeOK ==
    outputs \subseteq AllowedOutputs

BalancesTypeOK ==
    /\ DOMAIN balances = DOMAIN StartingBalances
    /\ \A key \in DOMAIN balances : balances[key] \in 0..Sum(StartingBalances)

ContentionedTypeOK ==
    contentioned \in 1..PROGRAM_SIZE

TypesOK ==
    /\ OutputsTypeOK
    /\ BalancesTypeOK
    /\ ContentionedTypeOK

BalancesValueOK ==
    Sum(balances) = Sum(StartingBalances)

IncentiveOK ==
    /\ "Proof Refuted" \in outputs =>
       balances["verifier"] >= StartingBalances["verifier"]
    /\ "Argument Uncontested" \in outputs =>
       balances["prover"] >= StartingBalances["prover"]

Safe ==
    /\ TypesOK
    /\ BalancesValueOK
    /\ IncentiveOK

THEOREM Spec => [] Safe


(* Liveness Helpers. *)

Final ==
    ~ENABLED Next

ProverWins ==
    "Locked Funds" \notin outputs

VerifierWins ==
    "Locked Funds" \in outputs

(* Liveness Properties. *)

Terminates ==
    []<> Final

StakeIsFreed ==
    <> (balances["staked"] = 0)

HonestVerification ==
    <> IF IsProofValid THEN ProverWins ELSE VerifierWins

Live ==
    /\ Terminates
    /\ StakeIsFreed
    /\ HonestVerification

THEOREM Spec => [] Live

=============================================================================
