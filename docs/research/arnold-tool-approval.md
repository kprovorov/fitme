# eve's tool approval round trip, proven on a dev server

Research note, 2026-11-28. ADR 0027 rests Plan Proposals on one eve feature nobody had run: a tool call that eve holds until the User accepts it. Accept lets the call run, Decline denies it, and any message the User sends withdraws it. This note runs that round trip against `eve dev` with real model calls. It records what goes over the wire and what the chat runtime shows the app, so the tickets built on it (FIT-899, FIT-900, FIT-901, FIT-902, FIT-908, FIT-914) can rely on it.

Versions: eve 1.3.0 (session stream v27), `@assistant-ui/eve` 0.0.28, Node 26.13.1. The model was Arnold's default, `openai/gpt-6.1-terra`, through AI Gateway.

## Verdict

**It holds.** Every case behaves as ADR 0027 assumed:

| Case | Result |
| --- | --- |
| 1. Hold | The call waits as `interaction.opened` + `turn.paused`. `execute` has not run. |
| 2. Approve | `call.started` (`clearedBy: { interactionId }`), `execute` runs once, and the model reads its output. |
| 3. Deny | `call.settled` `rejected`, never run. The model gets `TOOL_EXECUTION_DENIED` with the User's note quoted. |
| 4. Withdraw by message | The interaction ends `withdrawn` / `superseded-by-message`. The call ends `rejected`, never run. The model answers the message. |
| 5. Refuse before a hold | The policy's `{ type: "denied", reason }` ends the call `rejected` with `cause: { policy: "approval" }`. Nothing waits, and the model gets the reason. |
| 6. Reopen while held | A second client starting from a saved cursor and event log sees the interaction `open` and approves it. The call runs once. |
| 7. Re-run | A held call survives a server restart and runs once on approval. An approved call killed while it runs is **not** run again: it ends `abandoned`. |

There are six caveats. None of them blocks the design, but each lands on a ticket (see [Caveats](#caveats-for-the-tickets)):

- An exact typed `approve` or `deny` (or an option number) answers the approval.
- Answering an interaction that has already settled starts a new, empty turn with a model call.
- An approved call cut off while it runs ends `abandoned`, and the runtime drops its tool part.
- Recovering a run after a dev restart needs `eve dev --resume`.
- Changing the tool while a call waits didn't refuse the call on a dev server. This is untested on a deployment.
- After Deny with a note, the model proposed again in the same turn.

## How it was run

Nothing below is merged. The throwaway tool sat untracked in `apps/arnold/agent/tools/`, and the scripts lived outside the repository. Both are pasted here so the proof can be repeated.

1. Add the throwaway tool as `apps/arnold/agent/tools/probe_save_plan.ts` (below). It needs no Conversation owner and no database. It appends a line to a marker file when `execute` starts and when it ends, so "has it run?" is a file read. A `plan_name` containing "slow" sleeps 20 s inside `execute`, for case 7.
2. Start the server with the eval runner's principal. That gives a token-less `local-dev` caller and lets `admitTurn` through without a Clerk User (see `apps/arnold/agent/lib/eval-runner.ts`):

   ```sh
   EVE_EVALUATION=1 PROBE_MARKER=<scratch>/marker.log \
     scripts/with-dev-env.sh Arnold -- pnpm --filter @fitme/arnold exec eve dev --no-ui --port 3005 --resume
   ```

   `pnpm dev:arnold` works for cases 1–6. Case 7 needs `--resume` (see case 7).

3. Drive it with eve's own `Client` and `SessionStore` from `eve/client`. `SessionStore` is the class `useEveAgent`, and so `useEveAgentRuntime`, wraps. Pass its `snapshot.messages` through `convertEveMessages` from `@assistant-ui/eve` to see the `ThreadMessage` content the mobile app renders. A wrapped global `fetch` logs each request. A bounded read, `GET /eve/v1/session/:id/stream?startIndex=0&follow=false`, dumps the stored lines after each step.
4. Send `clientContext: { language: "en" }` on every send and respond, as the app does.
5. Afterwards, delete the tool file and check that `git status` is clean.

<details>
<summary>The throwaway tool</summary>

```ts
import { appendFileSync } from "node:fs";

import { defineTool } from "eve/tools";
import { z } from "zod";

const MARKER = process.env.PROBE_MARKER ?? "/tmp/probe-marker.log";

export default defineTool({
  description:
    "Save a Plan the User asked for. Call it whenever the User asks you to save a plan. The User has to accept it before it is saved.",
  inputSchema: z.object({ plan_name: z.string(), reps: z.number() }),
  approval: {
    request: ({ toolInput }) => {
      if (toolInput === undefined) return "user-approval";
      if (
        !Number.isInteger(toolInput.reps) ||
        toolInput.reps < 1 ||
        toolInput.reps > 50
      ) {
        return {
          type: "denied",
          reason: `reps must be a whole number from 1 to 50, got ${toolInput.reps}`,
        };
      }
      return "user-approval";
    },
    prompt: ({ input }) =>
      `Save plan "${input.plan_name}" with ${input.reps} reps?`,
  },
  async execute(input, ctx) {
    appendFileSync(
      MARKER,
      `${new Date().toISOString()} STARTED ${JSON.stringify(input)} session=${ctx.session.id}\n`
    );
    if (input.plan_name.toLowerCase().includes("slow")) {
      await new Promise((resolve) => setTimeout(resolve, 20_000));
    }
    appendFileSync(
      MARKER,
      `${new Date().toISOString()} EXECUTED ${JSON.stringify(input)} session=${ctx.session.id}\n`
    );
    return { saved: true, plan_name: input.plan_name, reps: input.reps };
  },
});
```

</details>

<details>
<summary>The client script (core of it)</summary>

```js
import { convertEveMessages } from "@assistant-ui/eve"; // dist/convertEveMessages.js
import { Client, SessionStore } from "eve/client";
import { openInteractions } from "eve/events";

const base = "http://127.0.0.1:3005";
const ctx = { clientContext: { language: "en" } };
const client = new Client({ baseUrl: base });

// Hold
const { session, delivery } = await client.sessions.create({
  message: "Save a plan called Push A with 10 reps.",
  ...ctx,
});
const { outcome, interactions } = await delivery.result(); // "awaiting-input", one open approval

// Approve / deny
await (
  await session.respond(
    [{ interactionId: interactions[0].interactionId, optionId: "approve" }],
    ctx
  )
).result();
// or { optionId: "deny", text: "Make it 12 reps instead." }

// Withdraw
await (
  await session.send(
    "Actually, before that: which muscles does a bench press work?",
    ctx
  )
).result();

// What the app sees
const store = new SessionStore({
  baseUrl: base,
  initialSession: { sessionId, streamIndex: 0 },
});
const stop = store.observe();
await store.resume();
const shown = convertEveMessages(
  { messages: store.snapshot.messages },
  { isRunning: false, events: store.snapshot.events }
);
stop();

// Reopen: a second store from the first one's saved session and events
const b = new SessionStore({
  baseUrl: base,
  initialSession: saved.session,
  initialEvents: saved.events,
});
b.observe();
await b.resume();
const [open] = openInteractions(b.snapshot.view);
await b.send({
  answers: [{ interactionId: open.interactionId, optionId: "approve" }],
  ...ctx,
});
```

</details>

The stream excerpts below leave out `call.input` progress records, `usage.recorded` payloads, trace data and model text deltas. `[n]` is the line's index, and `+` marks another fact on the same line. Ids are shortened.

## The client's requests

| Action | Request | Answer |
| --- | --- | --- |
| First message | `POST /eve/v1/session` `{ message: string, clientContext: { language } }` | 202 |
| Message while held | `POST /eve/v1/session/:id` `{ message: string, clientContext }` | 202 |
| Approve | `POST /eve/v1/session/:id` `{ answers: [{ interactionId, optionId: "approve" }], clientContext }` | 202 |
| Deny | `POST /eve/v1/session/:id` `{ answers: [{ interactionId, optionId: "deny", text?: string }], clientContext }` | 202 |
| Follow | `GET /eve/v1/session/:id/stream?startIndex=<cursor>`, with `includeTailIndex=1` on a store's catch-up read | 200 |

A body carries exactly one of `message` and `answers`. The client sends no extra route for approvals: an answer is an ordinary session message. `delivery.result()` reports `outcome: "awaiting-input"` with `interactions[]` while a call waits, and `"handled"` once the turn settles.

## Case by case

### 1. Hold

```
[0]  session.started + delivery.admitted {deliveryId: D1}
[1]  turn.started {turnId: turn_0, cause: {deliveryId: D1}, follows: null}
     + delivery.consumed {turnId: turn_0, parts: [{kind: text, text: "Save a plan called Push A with 10 reps."}]}
[2]  model.requested {runId: run_0}
[3]  model.started
[10] call.requested {callId: C1, capability: {kind: tool, name: probe_save_plan}, input: {plan_name: "Push A", reps: 10}}
[11] model.settled {outcome: completed, finishReason: tool-calls} + usage.recorded
[12] interaction.opened {interactionId: I1, subject: {callId: C1},
       request: {kind: approval, display: confirmation, allowFreeform: false,
                 prompt: "Save plan \"Push A\" with 10 reps?", options: [{id: approve, label: Approve}, {id: deny, label: Deny}]}}
[13] turn.paused {turnId: turn_0, awaiting: [{interactionId: I1}]}
     + delivery.settled {deliveryId: D1, outcome: awaiting-input}
```

The marker file has no line for the session, so `execute` hasn't run. There's no `call.started`.

**What the runtime shows the app** (`convertEveMessages`, one assistant message):

```json
status: { "type": "requires-action", "reason": "tool-calls" }
{ "type": "tool-call", "toolCallId": "C1", "toolName": "probe_save_plan",
  "args": { "plan_name": "Push A", "reps": 10 },
  "approval": { "id": "I1", "prompt": "Save plan \"Push A\" with 10 reps?", "display": "decision",
                "options": [{ "id": "approve", "kind": "allow-once", "label": "Approve" },
                            { "id": "deny", "kind": "reject-once", "label": "Deny" }] } }
```

There's no `result` and no `approved`. The part also carries `providerMetadata.eve.interaction` (`interactionId`, `prompt`, `kind`, `display`, `allowFreeform`, `options`). The card is drawn from `args`, and Accept and Decline answer `approval.id`. The runtime answers with `onRespondToToolApproval`, which maps the response through `toEveInputResponse` to `agent.respond([answer])`: the same `answers` body as above.

### 2. Approve

```
[14] delivery.admitted {deliveryId: D2}
[15] response.submitted {interactionId: I1, deliveryId: D2} + response.admitted
[16] response.settled {outcome: applied}
     + interaction.settled {interactionId: I1, outcome: accepted, response: {optionId: approve}}
[17] delivery.consumed {turnId: turn_0, deliveryId: D2, parts: []}
[18] call.started {callId: C1, clearedBy: {interactionId: I1}}
[19] call.settled {callId: C1, outcome: completed, output: {saved: true, plan_name: "Push A", reps: 10}}
[20] model.requested {runId: run_1}
     …
[27] model.settled {outcome: completed, finishReason: stop}
[28] turn.settled {turnId: turn_0, outcome: completed} + delivery.settled {deliveryId: D2, outcome: handled}
```

The marker file shows `STARTED` and `EXECUTED` once. The model read the output and replied "Saved **Push A** with 10 reps."

**Runtime after approve:** the same part, with `status: { type: "complete", reason: "stop" }`, `approval.approved: true`, `approval.optionId: "approve"` and `result: { saved: true, … }`. The reply text follows in the same message.

### 3. Deny

Approve's lines up to `response.settled`, then:

```
[17] interaction.settled {interactionId: I1, outcome: declined, response: {optionId: deny, text: "Make it 12 reps instead."}}
     + call.settled {callId: C1, outcome: rejected, cause: {interactionId: I1},
         output: {approval: {interactionId: I1, status: denied}, code: TOOL_EXECUTION_DENIED,
                  message: "Tool execution was denied. The person who denied it wrote: \"Make it 12 reps instead.\"",
                  tool: {result: not_run}},
         error: {code: TOOL_EXECUTION_DENIED, message: …}}
[18] delivery.consumed {turnId: turn_0, deliveryId: D2, parts: []}
[19] model.requested {runId: run_1}
[26] call.requested {callId: C2, input: {plan_name: "Pull B", reps: 12}}
[28] interaction.opened {interactionId: I2, subject: {callId: C2}, …}
[29] turn.paused {turnId: turn_0, awaiting: [{interactionId: I2}]}
```

There's no `call.started`, and the marker file is empty. With a note, the model proposed again at once, in the same turn: a second held call.

**Runtime after deny:** the first part has `approval.approved: false`, `approval.optionId: "deny"`, `approval.text: "Make it 12 reps instead."`, `result: { error: "Tool execution was denied. The person who denied it wrote: …" }` and `isError: true`. The second part is waiting, like case 1. The message status stays `requires-action`.

### 4. Withdraw by message

The message "Actually, before that: which muscles does a bench press work?" was sent while I1 waited:

```
[15] delivery.admitted {deliveryId: D2}
[16] interaction.settled {interactionId: I1, outcome: withdrawn, reason: superseded-by-message}
     + call.settled {callId: C1, outcome: rejected, cause: {interactionId: I1},
         output: {approval: {interactionId: I1, status: ignored}, code: TOOL_EXECUTION_DENIED,
                  message: "Ignored because the user continued without responding.", tool: {result: not_run}}}
[17] delivery.consumed {turnId: turn_0, deliveryId: D2, parts: [{kind: text, text: "Actually, before that: …"}]}
[18] model.requested {runId: run_1}
     …
[37] turn.settled {turnId: turn_0, outcome: completed}
```

The call never ran, and the model answered the question. There's no `response.submitted`, since a withdrawal isn't an answer.

**Runtime after withdraw:** the part has `approval.resolution: "cancelled"`, `approval.reason: "superseded-by-message"`, no `approved`, `result: { error: "Ignored because the user continued without responding." }` and `isError: true`. The answer arrives as a second assistant message.

**Typed answers.** A message whose whole text is an option's id, its label or its number answers the approval instead of withdrawing it:

| Message | Interaction | Ran |
| --- | --- | --- |
| `approve` / `Approve` (label) / `1` | `accepted` | yes |
| `Deny` | `declined` | no |
| `yes`, `Approve.`, `ok, approve` | `withdrawn` / `superseded-by-message` | no |

A typed answer shows on the stream as `response.submitted`, with a response id ending `_typed_0`, then `interaction.settled`. It's followed by `delivery.consumed` carrying the typed text. This is eve's documented behaviour (`docs/tools/human-in-the-loop.md`, "How pause and resume works").

### 5. Refuse before the hold

The message asked for "exactly 500 reps". The policy returned `{ type: "denied", reason }`:

```
[10] call.requested {callId: C1, input: {plan_name: "Arms D", reps: 500}}
[11] call.settled {callId: C1, outcome: rejected, cause: {policy: approval},
       output: {code: TOOL_EXECUTION_DENIED, message: "reps must be a whole number from 1 to 50, got 500", tool: {result: not_run}}}
[12] model.settled {finishReason: tool-calls}
[13] model.requested {runId: run_1}
     …
[29] turn.settled {outcome: completed}
```

There's no `interaction.opened` and no `turn.paused`, and `delivery.result()` reported `handled` with no interactions. The model passed the reason on to the User. **Runtime:** a tool-call part with `args`, no `approval`, `result: { error: "reps must be …" }` and `isError: true`. The app must not draw a card for a part with no `approval`. This is how FIT-914's check refuses an invalid proposal before the User sees one.

### 6. Reopen while held

Store A (the app before it closes) sent the message through `SessionStore.send` and saved `snapshot.session` (`{ sessionId, streamIndex: 13 }`) and `snapshot.events` (16 events), as the app saves its Conversation. Store B was built from those, as a reopened app is, and called `resume()`:

- Requests: `GET …/stream?startIndex=13&includeTailIndex=1`. That's a catch-up read from the saved cursor, not from 0.
- `openInteractions(B.snapshot.view)` → I1 `open`, with no answer.
- `B.send({ answers: [{ interactionId: I1, optionId: "approve" }] })` → the same lines as case 2. The call ran once.

A bare `client.sessions.attach(id)` with only the id and cursor (`stream({ startIndex: 14, follow: false })` read nothing new) could also `respond` with the interaction id from the first result. The call ran once.

### 7. Re-run

**A held call across a restart.** A call was held, the server was killed, and `eve dev --resume` was started again. Approving then gave the lines of case 2 and ran the call once. Without `--resume`, the restarted dev server refuses every send to a run from an earlier dev invocation with a 500 (`DevelopmentRunUnavailableError: Local Workflow run was not resumed… restart eve dev with --resume`). That's local-dev only: a deployment's Workflow world keeps runs across instances.

**Answering again.** Answering the same interaction again after it had settled (an approve on an `accepted` interaction) returned 202 and ran nothing. But it started a new turn, and that turn made a model call:

```
[31] delivery.admitted
[32] turn.started {turnId: turn_1, follows: turn_0} + delivery.consumed {turnId: turn_1, parts: []}
[33] model.requested {runId: run_2}
     …
[41] turn.settled {turnId: turn_1, outcome: completed}
```

**An approved call cut off while it runs.** After approval, `execute` started (`STARTED` in the marker) and slept. The server was killed during the sleep and started again with `--resume`:

```
[18] call.started {callId: C1, clearedBy: {interactionId: I1}}
[19] call.settled {callId: C1, outcome: abandoned, reason: step-interrupted}
[20] model.requested {runId: run_1}
     …
[38] turn.settled {turnId: turn_0, outcome: completed}
```

`execute` was **not** run again: the marker file has one `STARTED` and no `EXECUTED`. The model was told the outcome is unknown and said so: "I couldn't confirm whether the save request went through. Please check…". This matches eve's repair rule (`docs/concepts/sessions-runs-and-streaming.md`: eve never runs the old call again, and tells the model to check external state). **Runtime:** eve's own projection (`SessionStore.snapshot.messages`) has no tool part for an abandoned call. The Conversation shows only the User's message and the reply text, and `convertEveMessages` has no part to convert.

**Changing the tool while a call waits.** The tool's description was edited while a call waited. eve dev rebuilt, and the approval was then accepted and the call ran. eve doesn't refuse a held call over a change on a dev server. The spec's "a deploy while a proposal waits" case (eve refuses a held call whose tool changed) is a deployment matter, and **wasn't tested here**.

## Turns, and what marks each act

The spec asks this question for FIT-901, the cap restart. **A message sent while a call waits continues the paused turn; it doesn't start a new one.** So do approve and deny. In cases 2, 3 and 4, every line after the pause carried `turnId: turn_0`, with no second `turn.started`. The one exception is an answer to an interaction that has already settled, which opens a new turn (case 7).

Each User act inside the paused turn writes its own delivery, and those are the events the caps restart on:

| Act | Events |
| --- | --- |
| Message (withdraw) | `delivery.admitted`; `interaction.settled {outcome: withdrawn, reason: superseded-by-message}`; `delivery.consumed {turnId, parts: [text…]}` |
| Approve | `delivery.admitted`; `response.submitted {interactionId}`; `interaction.settled {outcome: accepted}`; `delivery.consumed {turnId, parts: []}` |
| Deny | `delivery.admitted`; `response.submitted {interactionId}`; `interaction.settled {outcome: declined}`; `delivery.consumed {turnId, parts: []}` |
| Typed `approve` / `deny` | as Approve / Deny, with `delivery.consumed` carrying the typed text |

`delivery.consumed` with the turn's `turnId` is the one event every act writes, and it comes before the next `model.requested`. A hook that resets the turn's model-call count and cost on `delivery.consumed` for a turn already under way covers all three. The first `delivery.consumed` comes with `turn.started`.

## Caveats for the tickets

1. **A typed `approve`, `deny` or option number answers the proposal** (`1` was tested; `2` for deny follows the same rule but wasn't run) (FIT-914, mobile). A User who types "Approve" accepts it, while "Approve." or "yes" withdraws it. The card and the composer hint should read with this in mind. Approval options can't be renamed from the tool, so this stays as long as Accept and Decline are eve's `approve` and `deny`.
2. **Answer only open interactions** (FIT-902, mobile). An answer to a settled interaction isn't an error. It starts an empty turn and pays for a model call. The app should send an answer only for an interaction `openInteractions(view)` lists, and disable Accept and Decline once it has sent one. The fake Arnold should answer a stale answer the way eve does.
3. **An approved save cut off while it runs ends `abandoned`, and its card disappears** (FIT-900, FIT-914, mobile). eve never runs it again, so the save's own transaction decides what happened: rolled back, or committed with the result never recorded. Arnold is told the outcome is unknown and should read the Plan again before proposing. The Plan version marker refuses a second save of a change that did commit. The create guard (FIT-899) covers a new Plan. The app has no tool part to draw, so a proposal card can vanish from the Conversation; the reply text is all that's left.
4. **Deny with a note proposes again in the same turn.** The cap restart still applies, since the deny is a User act. A plain Decline with no note may or may not re-propose; the prompt (FIT-914) decides.
5. **A tool changed while a call waits**: verify on a deployment before the flag comes off, together with the deployment run of the round trip the spec already plans.
6. **Local dev needs `--resume`** to keep a waiting proposal across a restart of `eve dev`. Without it, the next send answers a 500.

The note holds no secret, no token and no real User's Conversation: every session ran on a local dev server as eve's `local-dev` principal, with made-up Plan names.
