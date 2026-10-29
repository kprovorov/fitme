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

**App language**:
The language Fitme speaks to a User in: one of the languages Fitme supports (English, Ukrainian), taken from the User's device settings and never stored. Language only: how dates and numbers look follows the device's region.
_Avoid_: Locale, lang, UI language

**User id**:
The Clerk identifier of a User. The single key under which all User-owned data (Profile, Plans, Workout Sessions, Conversations) is stored and authorised.
_Avoid_: UUID, auth uid, sub

### Training

**Plan**:
A multi-workout training programme owned by one User. At most one Plan is active per User at a time.

**Workout**:
A single training day inside a Plan: an ordered list of exercises with target sets.

**Workout Session**:
One occurrence of a User performing a Workout, with the sets actually completed. At most one Workout Session per User can be open at a time: another Workout can't be started until it's finished.
_Avoid_: Session (ambiguous with a sign-in session), training log

**Plan Update**:
The structural changes a finished Workout Session suggests to its Workout (Exercises replaced, added or removed, sets added), which the User accepts or declines once. Accepted, they become the Workout's new targets.
_Avoid_: Plan changes, plan diff

**Exercise**:
A named movement from the Library, independent of any User, identified by its Exercise slug. Plans and Workout Sessions refer to Exercises; they never own them.

**Exercise slug**:
The permanent, readable identifier of an Exercise (`bench-press`): lowercase letters and digits joined by single hyphens. It never changes, even when the Exercise's name does.
_Avoid_: Exercise id, exercise uuid

### Library

**Library**:
Everything Fitme offers to every User, independent of any one User: today every Exercise (names, muscle groups, descriptions, instructions, thumbnails and videos), written in English and translated into other App languages. Owned by the private `fitme-exercises` repository and not stored in Postgres. Content is added, never removed.
_Avoid_: Exercise Library, exercise catalog, exercise database, exercises table

**Library API**:
The service (`apps/library`) that serves the Library to the apps and the Public API.
_Avoid_: Exercise API, Exercise Library API, exercises service

### Arnold

**Arnold**:
Fitme's AI that a User talks to about their training.
_Avoid_: Coach, AI coach, agent, AI agent, assistant, chatbot

**Conversation**:
One thread of messages between a User and Arnold. A User works in one current Conversation at a time; past ones are not kept beyond a limited retention period and are wiped when the User deletes their account. Never a thread with a human Coach.
_Avoid_: Chat, thread, session

### Coaching

**Coach**:
A real person who trains Users through Fitme. Never Arnold.
_Avoid_: Trainer, PT, personal trainer

### Public API

**Public API**:
The one HTTP contract (`apps/api`, `/v1`) every caller uses to read and write a User's data: Fitme's own apps and anyone else's alike. There is no separate internal API; a route may be restricted to First-party apps, but it is still part of the same contract.
_Avoid_: REST API, internal API, BFF, backend

**First-party app**:
Fitme's own mobile or web app, calling the Public API with the User's Clerk session.
_Avoid_: Client, frontend, internal caller

**Third-party app**:
Someone else's app that a User has connected to Fitme through OAuth, acting on that User's behalf.
_Avoid_: Integration, partner, client, OAuth app

**API key**:
A secret a User creates to call the Public API as themselves, for their own scripts and tools.
_Avoid_: Token, personal access token, secret key
