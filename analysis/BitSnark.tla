------------------------------ MODULE BitSnark ------------------------------
(***************************************************************************)
(* This module specifies the transaction flow in the bitSNARK protocol.    *)
(***************************************************************************)

EXTENDS Naturals

VARIABLES
    (* All published transactions. *)
    blockchain,
    (* Balances of the participants. *)
    balances

Transactions == {
    "Proof", "Uncontested Proof", "Challenge", "Uncontested Challenge",
    "State", "Uncontested State", "Select", "Uncontested Select",
    "Argument", "Uncontested Argument", "Proof Refuted"
}

StartingBalances == [prover |-> 2, verifier |-> 1, locked |-> 0]

IsProofValid == CHOOSE v \in {TRUE, FALSE} : TRUE

(* Invariants. *)

TypeOK ==
    /\ blockchain \subseteq Transactions
    /\ DOMAIN balances = {"prover", "verifier", "locked"}
    

Sum(bs) == bs["prover"] + bs["verifier"] + bs["locked"]
ValueOK == Sum(balances) = Sum(StartingBalances)

IncentiveOK ==
    /\ "Proof Refuted" \in blockchain =>
       balances["verifier"] >= StartingBalances["verifier"]
    /\ "Uncontested Argument" \in blockchain =>
       balances["prover"] >= StartingBalances["prover"]        

AllOK ==
    /\ TypeOK
    /\ ValueOK
    /\ IncentiveOK
    
(* Transaction Functions. *)

Proof ==
    /\ blockchain = {}
    /\ blockchain' = blockchain \union {"Proof"}
    /\ balances' = [balances EXCEPT !["prover"] = @ - 2, !["locked"] = @ + 2]
    
UncontestedProof ==
    /\ "Proof" \in blockchain
    /\ {"Uncontested Proof", "Challenge", "State"} \intersect blockchain = {}
    /\ blockchain' = blockchain \union {"Uncontested Proof"}
    /\ balances' = [balances EXCEPT !["locked"] = @ - 2, !["prover"] = @ + 2]
    
Challenge ==
    /\ "Proof" \in blockchain
    /\ {"Uncontested Proof", "Challenge", "State"} \intersect blockchain = {}
    /\ blockchain' = blockchain \union {"Challenge"}
    /\ balances' = [balances EXCEPT !["verifier"] = @ - 1, !["locked"] = @ + 1]
    
UncontestedChallenge ==
    /\ "Challenge" \in blockchain
    /\ {"State", "Uncontested Challenge"} \intersect blockchain = {}
    /\ blockchain' = blockchain \union {"Uncontested Challenge"}
    /\ balances' = [balances EXCEPT !["locked"] = @ - 3, !["verifier"] = @ + 3]
    
State ==
    /\ "Proof" \in blockchain
    /\ {"Uncontested Proof", "Challenge", "State"} \intersect blockchain = {}
    /\ blockchain' = blockchain \union {"State"}       
    /\ UNCHANGED balances

UncontestedState ==
    /\ "State" \in blockchain
    /\ {"Select", "Uncontested State"} \intersect blockchain = {}
    /\ blockchain' = blockchain \union {"Uncontested State"}
    /\ balances' = [balances EXCEPT !["locked"] = @ - 3, !["prover"] = @ + 3]
    
Select ==
    /\ "State" \in blockchain
    /\ {"Uncontested State", "Select"} \intersect blockchain = {}
    /\ blockchain' = blockchain \union {"Select"}
    /\ UNCHANGED balances

UncontestedSelect ==
    /\ "Select" \in blockchain
    /\ {"Argument", "Uncontested Select"} \intersect blockchain = {}
    /\ blockchain' = blockchain \union {"Uncontested Select"}
    /\ balances' = [balances EXCEPT !["locked"] = @ - 3, !["verifier"] = @ + 3]

Argument ==
    /\ "Select" \in blockchain
    /\ {"Uncontested Select", "Argument"} \intersect blockchain = {}
    /\ blockchain' = blockchain \union {"Argument"}
    /\ UNCHANGED balances

UncontestedArgument ==
    /\ "Argument" \in blockchain
    /\ {"Uncontested Argument", "Proof Refuted"} \intersect blockchain = {}
    /\ blockchain' = blockchain \union {"Uncontested Argument"}
    /\ balances' = [balances EXCEPT !["locked"] = @ - 3, !["prover"] = @ + 3]

ProofRefuted ==
    /\ "Argument" \in blockchain
    /\ {"Uncontested Argument", "Proof Refuted"} \intersect blockchain = {}
    /\ IsProofValid = FALSE
    /\ blockchain' = blockchain \union {"Proof Refuted"}
    /\ balances' = [balances EXCEPT !["locked"] = @ - 3, !["verifier"] = @ + 3]

(* Flow. *)
    
Init ==
    /\ blockchain = {}
    /\ balances = StartingBalances

Next ==
  \/ Proof
  \/ UncontestedProof
  \/ Challenge
  \/ UncontestedChallenge
  \/ State
  \/ UncontestedState
  \/ Select
  \/ UncontestedSelect
  \/ Argument
  \/ UncontestedArgument
  \/ ProofRefuted

 ============================================================================