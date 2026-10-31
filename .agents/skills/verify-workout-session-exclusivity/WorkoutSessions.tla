------------------------- MODULE WorkoutSessions -------------------------
EXTENDS Naturals, FiniteSets

CONSTANTS KeyMode, TwoUsers
VARIABLES rows, phase, workout

vars == <<rows, phase, workout>>
Writers == 1..3
Sessions == 0..3
Owners == <<"user1", "user1", IF TwoUsers THEN "user2" ELSE "user1">>
Workouts == <<"workoutA", "workoutB", IF TwoUsers THEN "workoutC" ELSE "workoutA">>
Owner(s) == IF s = 0 THEN "user1" ELSE Owners[s]
OpenFor(u) == {s \in Sessions : rows[s] = "open" /\ Owner(s) = u}

(* SQL NULLs are distinct in an ordinary unique workout_id index. *)
SameKey(s, t) ==
  CASE KeyMode = "user" -> Owner(s) = Owner(t)
    [] KeyMode = "workout" -> workout[s] # "none"
                               /\ workout[s] = workout[t]
    [] OTHER -> FALSE

Busy(t) == \E s \in Sessions \ {t} :
  rows[s] \in {"pending", "open"} /\ SameKey(s, t)

Init ==
  /\ rows \in [Sessions -> {"absent", "open"}]
  /\ \A t \in Writers : rows[t] = "absent"
  /\ phase = [t \in Writers |-> "ready"]
  /\ workout = [s \in Sessions |-> IF s = 0 THEN "none" ELSE Workouts[s]]

(* findOpenSession is a READ COMMITTED statement, not an insert lock. *)
ReadOpen(t) ==
  /\ phase[t] = "ready"
  /\ phase' = [phase EXCEPT ![t] =
        IF OpenFor(Owners[t]) = {} THEN "readEmpty" ELSE "done"]
  /\ UNCHANGED <<rows, workout>>

(* The unique index reserves a key even for an uncommitted insertion.
   A writer that bypasses the service may insert directly from ready. *)
Insert(t) ==
  /\ phase[t] \in {"ready", "readEmpty"}
  /\ ~Busy(t)
  /\ rows' = [rows EXCEPT ![t] = "pending"]
  /\ phase' = [phase EXCEPT ![t] = "inserted"]
  /\ UNCHANGED workout

(* ON CONFLICT after the winning insertion commits; SQL errors for a raw
   writer have the same no-write effect for this safety property. *)
Conflict(t) ==
  /\ phase[t] \in {"ready", "readEmpty"}
  /\ \E s \in Sessions \ {t} : rows[s] = "open" /\ SameKey(s, t)
  /\ phase' = [phase EXCEPT ![t] = "done"]
  /\ UNCHANGED <<rows, workout>>

Commit(t) ==
  /\ phase[t] = "inserted"
  /\ rows' = [rows EXCEPT ![t] = "open"]
  /\ phase' = [phase EXCEPT ![t] = "done"]
  /\ UNCHANGED workout

Rollback(t) ==
  /\ phase[t] = "inserted"
  /\ rows' = [rows EXCEPT ![t] = "absent"]
  /\ phase' = [phase EXCEPT ![t] = "done"]
  /\ UNCHANGED workout

(* Only the commit that frees the key is observable to an insertion.
   Uncommitted finishes/deletes keep the old key; their rollbacks stutter. *)
Finish(s) ==
  /\ rows[s] = "open"
  /\ rows' = [rows EXCEPT ![s] = "finished"]
  /\ UNCHANGED <<phase, workout>>

Delete(s) ==
  /\ rows[s] \in {"open", "finished"}
  /\ rows' = [rows EXCEPT ![s] = "deleted"]
  /\ UNCHANGED <<phase, workout>>

(* ON DELETE SET NULL can orphan an open session without finishing it. *)
RemoveWorkout(s) ==
  /\ rows[s] \in {"open", "finished"}
  /\ workout[s] # "none"
  /\ workout' = [workout EXCEPT ![s] = "none"]
  /\ UNCHANGED <<rows, phase>>

Done ==
  /\ \A t \in Writers : phase[t] = "done"
  /\ UNCHANGED vars

Next ==
  \/ \E t \in Writers : ReadOpen(t)
  \/ \E t \in Writers : Insert(t)
  \/ \E t \in Writers : Conflict(t)
  \/ \E t \in Writers : Commit(t)
  \/ \E t \in Writers : Rollback(t)
  \/ \E s \in Sessions : Finish(s)
  \/ \E s \in Sessions : Delete(s)
  \/ \E s \in Sessions : RemoveWorkout(s)
  \/ Done

OneOpenPerUser == \A u \in {Owners[t] : t \in Writers} \cup {"user1"} :
  Cardinality(OpenFor(u)) <= 1

=============================================================================
