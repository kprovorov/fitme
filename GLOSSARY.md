# Fitme

A personal workout planner: a person signs up, fills in a fitness profile, gets AI-generated workout plans and logs workout sessions against them.

## Language

### Identity

**User**:
A person's identity as held by Clerk: id, email, name and sign-in methods. Fitme does not store Users; it stores data owned by a User, keyed by the User's Clerk id.
_Avoid_: Account, auth user, member

**Profile**:
The fitness facts a User provides during onboarding: gender, age, height, weight and measurement system. A User has at most one Profile and may have none until onboarding completes.
_Avoid_: User profile, user data, account details

**User id**:
The Clerk identifier of a User. The single key under which all User-owned data (Profile, Plans, Workout Sessions, Conversations) is stored and authorised.
_Avoid_: UUID, auth uid, sub

### Training

**Plan**:
A multi-workout training programme owned by one User. At most one Plan is active per User at a time.

**Workout**:
A single training day inside a Plan: an ordered list of exercises with target sets.

**Workout Session**:
One occurrence of a User performing a Workout, with the sets actually completed. At most one Workout Session per Workout can be open at a time.
_Avoid_: Session (ambiguous with a sign-in session), training log

**Exercise**:
A named movement from the shared exercise library, independent of any User.

### Coaching

**Coach**:
The AI assistant a User talks to about their training.
_Avoid_: Agent, AI agent, assistant, chatbot

**Conversation**:
One thread of messages between a User and the Coach. A User works in one current Conversation at a time; past ones are not kept beyond a limited retention period and are wiped when the User deletes their account.
_Avoid_: Chat, thread, session
