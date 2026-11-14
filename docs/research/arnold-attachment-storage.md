# Where Arnold's Attachment bytes should live

Research note, 2026-11-14. Question: in production, Arnold can't see the photos Users attach (ADR 0018), and the model answers "I couldn't access the image". eve stages every inbound file into the session sandbox and reads it back from there before each model call. Arnold's just-bash sandbox has no usable storage on Vercel. Which change keeps a Conversation's Attachments readable on every model call for the Conversation's whole 30-day life, on Vercel? The fix should stay within ADR 0018 (no storage of our own, deleted with the Conversation and on account deletion). It is judged on cost, latency, deletion and code size, for at most 10 Attachments of about 400 KB each per Conversation.

Repo facts are cited as `path:line`. The eve facts come from its shipped docs and its compiled source in `node_modules/eve` (0.80.0, the pinned version), plus the published 0.83.x, 0.84.0, 0.91.0 and 1.0.0-rc.17 tarballs, unpacked with `npm pack`. eve's `dist` files are minified onto one line, so they're cited by path only. External claims link to Vercel's docs. Anything I couldn't check is marked **(unverified)**.

## TL;DR

- **Recommendation: move eve to 0.83.3 and give Arnold `DefaultSandbox` with tuned Vercel options.** On Vercel this selects Vercel Sandbox. It needs no build-time template, because Arnold has no `prepare`, workspace or skills. Locally it stays just-bash, or Docker when Docker is running. The sandbox file itself is about 15 lines. The bump costs more than that (§3.7), mainly because 0.82.0 makes `sessionTimeoutMs` an idle timeout. The options:

  ```ts
  DefaultSandbox.environment({
    justBash: { autoInstall: false },
    vercel: {
      keepLastSnapshots: {
        count: 1,
        deleteEvicted: true,
        expiration: 31 * DAY_MS,
      },
      networkPolicy: "deny-all",
      resources: { vcpus: 1 },
      snapshotExpiration: 31 * DAY_MS,
      timeout: 5 * MINUTE_MS,
    },
  });
  ```

  This fits ADR 0018 as written: eve keeps the bytes and deletes them itself. A reset, and so account deletion, runs eve's session finalization. That deletes the Vercel Sandbox together with its snapshots. The 31-day snapshot expiry is the backstop when that cleanup fails.

- **Why 0.83.x, not 0.80.0.** Four changes matter. The first two are 0.83.1, so that's the lowest release with all of them. 0.83.3 is its latest patch.
  - Hydration reads come from a bounded in-memory cache, so a warm instance doesn't wake the VM on every model call (0.83.1).
  - A turn resumes the session's sandbox in the background as it begins, so the model call doesn't wait for it (0.83.1, 3fbef89).
  - A gone sandbox is replaced by a fresh one (0.83.0). On 0.80.0, every later attachment in that session fails.
  - The Vercel provider gets a real `onSessionEnd`, and a template-less session applies the environment's `networkPolicy` (0.83.0). On 0.80.0, deny-all can't be set through `DefaultSandbox`.

  Stop below 0.84.0: it changes `defineDynamic`, which `agent/agent.ts` uses.

- **The bump changes a Conversation's lifetime: decide this first.** From 0.82.0, `limits.sessionTimeoutMs` is an idle timeout. The 30-day window restarts each time a turn settles (964a41f), so a Conversation in use no longer ends 30 days after it starts.
  - `agent/agent.ts:19-21` assumes it does, and so do AGENTS.md, ADR 0018 and the privacy policy (`apps/site/app/privacy-policy/page.tsx:98`, `:234`).
  - Either accept idle-based Conversations and update all four, or enforce the absolute 30 days ourselves. A hook that ends the session once `now − start > 30 days` would do it **(unverified that eve exposes the start time to a hook)**.
  - The snapshot math below holds either way: no two uses of a snapshot are more than 30 days apart.

- **Cost, tuned:** about **$0.0035 per wake**: 1 vCPU and 2 GB for at most 5 minutes, at $0.0212/GB-hour. Add **about $0.01–0.04 per photo Conversation-month** of snapshot storage (one snapshot of about 0.14–0.5 GB at $0.08/GB-month; the size is **(unverified)**). A photo Conversation with 10 turns spread over its life comes to about **$0.05–0.08**. The images themselves already cost several cents of model input per step. With eve's defaults (30 minutes and 2 vCPU/4 GB per wake, plus one more snapshot per wake), the same Conversation costs about **$0.5–0.8**. So the options aren't optional.
- **The unknown is latency.** After the first photo, every model call in the Conversation hydrates, text-only turns included. On a cold instance a stopped sandbox has to resume from its snapshot first, and Vercel publishes no resume time. **Measure it on a preview (§7). If a resumed sandbox adds more than about 1.5 s p95 to a model step, or the measured cost per photo Conversation is above about $0.10, switch to option C: a custom eve sandbox provider backed by a private Vercel Blob store.** Option C costs about $0.002 per Conversation and adds tens of milliseconds per read **(unverified)**. Its price is about 150 lines of code against a sandbox-provider API that is still in preview, and an ADR 0018 rewrite ("no storage of our own" stops being true).
- **Rejected:** shipping the just-bash template (`/var/task` is read-only, and `/tmp` isn't shared between workflow steps); a Vercel Sandbox Drive (it still needs the VM, and eve stages into `/workspace`, not into a mount); provider file references; URL file parts; and turning images into text descriptions.
- **Photos already sent are lost to Arnold.** Their file parts became "could not be stored" notes in session history. The app still shows them from the device copy, but Users must send them again.

## 1. What fails today, and why

- Arnold's sandbox is just-bash (`apps/arnold/agent/sandbox.ts:1-9`). It's file-backed under eve's `storagePath`. In production, that path resolves under `/var/task/.eve/sandbox-cache/just-bash/…`, and the template isn't shipped there. The 2026-11-14 production logs show `SandboxTemplateNotProvisionedError` followed by `[eve:harness.attachment-staging] session sandbox unavailable, degrading attachments to text`.
- eve's hosted build only prunes local providers when **none** is configured: `shouldPruneLocalSandboxProviders` is `preset === "vercel"` and no local backend among the configured ones (`dist/src/internal/nitro/host/create-application-nitro.js`). Arnold names just-bash explicitly, so it isn't pruned and runs as described above.
- **Staging** (`dist/src/harness/attachment-staging.js`, `stageAttachmentsToSandbox`): it returns early when a message has no file parts. Otherwise it asks for the sandbox, and without one it turns each file part into `Attachment <name> could not be stored: no sandbox is available.`. With a sandbox, it writes the bytes to `/workspace/.eve/attachments/<sha256-16>/<name>` and keeps only an `eve-sandbox:` reference in history. eve's own staging path is called from `dist/src/harness/step/intake.js`.
- **Hydration** (`hydrateSandboxAttachments`, called before every model call in `dist/src/harness/model-call/call.js`): it returns early when history holds no sandbox references. Otherwise it reads each one back with `readBinaryFile` and checks its size and hash prefix. Missing bytes become `FileNotFound: Current snapshot may be newer and does not contain …`.
- **Text-only Conversations never open a sandbox (verified).** Both functions return before touching `SandboxKey`, and the sandbox context is lazy: `ensureSandboxAccess().get()` only resolves on first use (`dist/src/execution/sandbox/ensure.js`). A Conversation with one photo, though, hydrates on **every** later model call, text-only turns included.
- **Existing sessions are safe to switch.** eve records a session's sandbox state only after the provider's `start()` resolves (`ensure.js`). In production `start()` threw, so no session holds just-bash state that a new provider would have to replace.

## 2. Options at a glance

|  | A. Vercel Sandbox, eve 0.80.0 | **B. Vercel Sandbox, eve 0.83.3 (recommended)** | C. Custom provider on private Blob | D. Drive mount | E. Other (refs, URLs, text) |
| --- | --- | --- | --- | --- | --- |
| Fixes the bug | Yes | Yes | Yes | No (still needs the VM; eve stages into `/workspace`) | No, or loses the image |
| Cost per photo Conversation (10 turns spread out) | ≈ $0.05–0.08 tuned, about the same as B: a running VM is reused inside its timeout. A's penalty is latency, not cost | **≈ $0.05–0.08** tuned | **≈ $0.002** | B plus Drive storage | n/a |
| Latency per model call | Sandbox lookup, base-setup command and one read per photo on **every** call; plus VM resume after idle **(unverified)** | Cache hit on a warm instance: none. Cold: like A **(unverified)** | N parallel private Blob reads, tens of ms **(unverified)** | Like B | n/a |
| Survives 30 days idle | Yes if `snapshotExpiration` is above 30 days. A lost sandbox breaks the rest of the session | Yes. A lost sandbox gets a fresh one (old photos then show as `FileNotFound`) | Yes, with a TTL of 31 days or more | Yes | n/a |
| Deleted on reset or account deletion | Yes: finalization resumes the sandbox, then deletes it with `deleteOrphanSnapshots` | Yes: Vercel `onSessionEnd` deletes it by name | Yes: our `onSessionEnd` deletes the prefix. Blob TTL is the backstop | Drive needs its own deletion | n/a |
| Backstop if cleanup fails | Snapshot expiry (31 days after last use) | Same | Blob `ttlDays: 31` | None built in | n/a |
| Network deny-all | Not reachable through `DefaultSandbox` | Yes (environment `networkPolicy`) | n/a (no VM) | Yes | n/a |
| Code size | About 10 lines | About 15 lines, plus the bump (§3.7: idle timeout, the mobile `eve` pin) | About 150 lines plus tests, a Blob store and `@vercel/blob` 2.9, plus the same bump | More than B | n/a |
| ADR 0018 fit | As written | **As written** (wording clarified) | Needs a rewrite: our own store | Needs a rewrite | n/a |

## 3. Option B: eve's Vercel Sandbox (recommended)

### 3.1 How eve uses it

Sources: `dist/src/execution/sandbox/bindings/vercel.js`, and `docs/sandbox/vercel.mdx` and `docs/sandbox/default.mdx`. I read 0.80.0 first, then re-checked each claim below in the 0.83.3 tarball:

- the environment options (with `timeout` defaulting to `DEFAULT_SANDBOX_TIMEOUT_MS`) are spread into `createSessionCreateParams`;
- `networkPolicy` is applied after base setup (`u.networkPolicy ?? n.networkPolicy`);
- `onSessionEnd` → `deleteNamedVercelSandbox` stops the sandbox, then calls `delete({ deleteOrphanSnapshots: true })`;
- a `reset` still returns `{ kind: "expired" }` and runs `endSessionSandboxStep`;
- the staging and hydration early returns are unchanged;
- the shutdown plugin still skips `VERCEL`.

- **One sandbox per session.** A session gets one persistent Vercel Sandbox named `eve-sbx-vercel-<hash>` with `persistent: true`, created on first use, so only once a photo arrives.
- **Workflow steps don't share a connection.** Every step resumes the sandbox: `Sandbox.get({ resume: false })`, then `ensureVercelSandboxBaseRuntime`, a short `bash -lc` script. That command is what auto-resumes a stopped VM ([Persistence: automatic resume](https://vercel.com/docs/sandbox/concepts/persistent-sandboxes#automatic-resume)). eve 0.83.3's custom-provider docs say it outright: "A connection lasts at most one step, so the next step resumes the sandbox through a new connection" (`docs/sandbox/custom-providers.mdx`).
- **The VM runs until its `timeout`.** eve's default is `DEFAULT_SANDBOX_TIMEOUT_MS = 18e5` (30 minutes), in 0.80.0 and 0.83.3 alike. eve's shutdown plugin isn't installed when `VERCEL` is set (`dist/src/internal/nitro/host/sandbox-shutdown-plugin.js`), and a serverless function freezes rather than exits. So nothing stops the VM before its timeout, and each wake bills memory for the whole timeout. Vercel bills provisioned memory in 1-minute minimum increments ([pricing](https://vercel.com/docs/sandbox/pricing#provisioned-memory)).
- **Stop and resume.** When the session stops, Vercel snapshots the filesystem automatically, and the next SDK call boots a new session from that snapshot ([Snapshots](https://vercel.com/docs/sandbox/concepts/snapshots#how-snapshots-fit-the-sandbox-lifecycle)). The `/workspace/.eve/attachments` files survive, which is exactly what hydration needs.
- **No template for Arnold.** `DefaultSandbox` on Vercel uses `skipEmptyPreparation`: with no `prepare`, no workspace files and no skills, `prepare()` returns `{}` and never builds a snapshot (`dist/src/sandbox/providers/vercel.js`). Arnold has no `agent/sandbox/` directory and no skills, so it needs no build-time Vercel Sandbox and no build credentials.
  - Runtime credentials come from `VERCEL_OIDC_TOKEN` (`vercel-credentials.js`), which Arnold already has (AI Gateway uses OIDC).
  - `VercelSandbox.environment()` in 0.80.0 _does_ build a template snapshot. That's a second reason to use `DefaultSandbox`; 0.83.0 removed the difference.

### 3.2 30-day survival

- **Expiry clock.** Snapshots expire **30 days after their last use** by default. The timer resets each time a sandbox is created or resumed from them, and a custom expiration may be 1 day to 10 years ([Snapshot retention](https://vercel.com/docs/sandbox/concepts/snapshots#snapshot-retention), [limits](https://vercel.com/docs/sandbox/concepts/snapshots#snapshot-limits)).
- **Longest gap.** On 0.80.0, a Conversation ends 30 days after it **starts** (`apps/arnold/agent/agent.ts:21`). From 0.82.0 it ends after 30 **idle** days (964a41f). Either way, no two turns are more than 30 days apart. Every model call in a photo Conversation reads its snapshot, text-only turns included, so the longest gap between two uses of a snapshot is under 30 days.
  - With the default, that gap is just inside the limit with no margin.
  - With `snapshotExpiration: 31 days`, the snapshot always survives the session.
  - A snapshot a failed cleanup leaves behind is gone at most 31 days after its last use, which keeps it inside the privacy policy's "no later than 96 days after the conversation ends" (`apps/site/app/privacy-policy/page.tsx:98-101`).
- **Options reach the session sandbox (verified).** The environment's options are spread into every session `Sandbox.create` (`createSessionCreateParams` in `vercel.js`). `snapshotExpiration` and `keepLastSnapshots` are `Sandbox.create` parameters in the bundled SDK (`dist/src/compiled/@vercel/sandbox/index.js`). eve itself sets `keepLastSnapshots: { count: 1 }` only for tool sessions (`vercel-tool-sessions.js`). Without our own retention, each wake leaves one more snapshot, each billed for up to 30 days.
- **When the sandbox or its snapshot is gone:**
  - **0.80.0:** `resume()` throws "no longer exists", or `ensureVercelSandboxBaseRuntime` fails with 410 `snapshot_not_found`. `activeSandbox` catches that and returns `null`. Every earlier photo then becomes `FileNotFound`, and every new one "could not be stored", **for the rest of the session**.
  - **0.83.0:** the provider throws `SandboxSessionGoneError`, and `ensure.js` logs "session sandbox is gone, starting a fresh one". Old photos still show as `FileNotFound`, but new ones work (changelog 39a8b4c).
  - Vercel also removes a sandbox that can't resume after 14 days of inactivity ([Sandbox retention](https://vercel.com/docs/sandbox/concepts/persistent-sandboxes#sandbox-retention)), which the 31-day expiry prevents.

### 3.3 Deletion: reset and account deletion

- **Reset ends the session.** `apps/webhooks/src/arnold.ts:104-105` posts eve's reset route for each of a deleted User's sessions. In eve's session loop, a parked `reset` returns the terminal outcome `{ kind: "expired" }` (`dist/src/execution/session/program.js`). That runs `finalizeSession`, then `endSessionSandboxStep` (`execution/session/finalization.js`, `execution/session/end-sandbox-step.js`), then the sandbox context's `end("expired")`.
- **0.80.0.** The Vercel provider has no `onSessionEnd`, so `end()` resumes the sandbox and calls `onSandboxDelete`. That stops it and deletes it with `deleteOrphanSnapshots: true` (`vercel-lifecycle.js`), which removes the snapshots no other sandbox uses. A session that never opened a sandbox (text only) skips this.
- **0.83.0.** `onSessionEnd` deletes the sandbox by name, even when the session never recorded state (changelog 3f698dd).
- **Failed cleanup.** eve retries the step, then only logs the failure (`reportSessionSandboxCleanupFailureStep`). The 31-day snapshot expiry is the backstop. The sandbox record itself goes after 14 days without a resumable snapshot.
- The 30-day expiry takes the same finalization path with `"expired"`.

### 3.4 Cost

Pro rates in `iad1` ([Sandbox pricing](https://vercel.com/docs/sandbox/pricing)): Active CPU $0.128/hour, provisioned memory $0.0212/GB-hour (2 GB per vCPU, 1-minute minimum), $0.60 per million creations, snapshot storage $0.08/GB-month. Data the sandbox downloads is free, and Arnold exposes no ports.

| Per wake (one resumed VM session) | Memory | Active CPU | Total |
| --- | --- | --- | --- |
| eve defaults (2 vCPU / 4 GB, 30-minute timeout) | 2 GB-h → $0.042 | seconds → under $0.001 | **≈ $0.042** |
| Tuned (1 vCPU / 2 GB, 5 minutes) | 0.167 GB-h → $0.0035 | under $0.001 | **≈ $0.0035** |

- **Snapshot size.** The eve base image (`ghcr.io/vercel/eve:0.80.0`, amd64) is 140 MB compressed, which I read from the registry manifest. Assume one snapshot holds about 0.14–0.5 GB, so $0.011–0.04 per month it's kept. Whether Vercel bills the whole filesystem or a delta is **(unverified)**, and so is whether eve's Vercel image (`vcr.vercel.com/vercel/eve/base`) is the same size.
- **Example.** A photo Conversation with 10 turns, each after the VM has stopped, kept for a month:
  - Tuned, with `keepLastSnapshots: 1`: 10 × $0.0035 + about $0.01–0.04 ≈ **$0.05–0.08**.
  - Defaults: 10 × $0.042 + up to 10 snapshots ≈ **$0.5–0.8**.
- **Turns inside the timeout.** Several turns within 5 minutes share one wake. Every step inside a turn does too, as long as the turn finishes inside the timeout. A turn longer than the timeout pays a second wake and a second resume.
- **Against the model.** Each step re-sends every photo. About 1.5k input tokens per 1600 px JPEG **(unverified, model-dependent)** makes 10 photos about 15k tokens, roughly $0.045 per uncached step at $3 per million. A tuned sandbox is a small share of a photo turn's cost, while the defaults are about the same size as the model's image cost.

### 3.5 Latency

- **0.80.0, every model call** in a photo Conversation does all of the following before calling the model:
  - `Sandbox.get`;
  - one `runCommand` (the base-setup script), which also boots the VM from its snapshot when it's stopped;
  - one `readFile` per photo.

  Each is an API round trip from `iad1` **(unverified: Vercel publishes no latency numbers, and the [duration and persistence guide](https://vercel.com/kb/guide/vercel-sandbox-duration-and-persistence) gives none)**. Snapshot creation got faster ([changelog](https://vercel.com/changelog/vercel-sandbox-snapshot-creation-is-now-up-to-10x-faster)), but restore time is unpublished.

- **0.83.1 and later** keep the images and PDFs eve staged or read in a per-process cache of 64 MB, keyed by session, path, size and type. "The sandbox is resumed only when eve needs bytes it doesn't already hold" (0.83.1 changelog, 6f551a7; `cachedRefBytes` in `harness/attachment-staging.js`). Fluid compute reuses instances, so most steps of one turn should hit the cache. The first step after a cold start still pays the resume.
- **Region.** `apps/arnold/vercel.json:1-4` sets no `regions`, so Functions run in Vercel's default, `iad1` **(unverified for this project: the Vercel MCP's `get_project` doesn't return the region)**. Sandbox defaults to `iad1` too, so they share a region. Setting `vercel.region` explicitly removes the doubt.

### 3.6 Network

- In 0.80.0, a template-less session is created with `networkPolicy: "allow-all"` for base setup. Only a policy passed to `open()` is applied afterwards (`createSessionCreateParams` / `openSession`), and `DefaultSandbox.open()` takes none. So 0.80.0 can't reach deny-all through `DefaultSandbox`.
- 0.83.0 applies an environment-level `networkPolicy` after base setup (changelog 12a1e90).
- Arnold has `defaultTools: false` (`apps/arnold/agent/agent.ts:9`), so no model-driven code runs in the sandbox. Deny-all is defence in depth, not the fix.
- just-bash refuses any policy other than `"allow-all"` in 0.83 (`docs/sandbox/troubleshooting.mdx`). So the policy goes in the `vercel` options, never in `open()`, or local `eve dev` would break.

### 3.7 The eve bump

- **0.83.1 is the lowest release with all three fixes; 0.83.3 is its latest patch.** I checked each tarball for the bytes cache (`cachedRefBytes`), session-gone recovery (`shared/sandbox-session-gone-error.js`) and the Vercel `onSessionEnd`:

  | Release | Bytes cache | Session-gone recovery | Vercel `onSessionEnd` |
  | ------- | ----------- | --------------------- | --------------------- |
  | 0.82.0  | no          | no                    | no                    |
  | 0.83.0  | no          | yes                   | yes                   |
  | 0.83.1  | yes         | yes                   | yes                   |
  | 0.83.3  | yes         | yes                   | yes                   |

- **Changelog items that touch Arnold:**
  - From 0.83.0, `DefaultSandbox` selects its provider once, at `eve build`, and records it. On Vercel that's Vercel Sandbox. Elsewhere it's Docker when a daemon answers, and just-bash only in `eve dev` / `eve eval` (`docs/sandbox/default.mdx` in 0.83.3).
  - Recorded sessions are stored under `"default"`. This is **one-way**: rolling back below 0.83 breaks sessions created on it.
  - The custom-provider API was rewritten. Arnold has no custom provider, but this rules out writing option C against 0.80.0 first.
  - **0.82.0, 964a41f: `limits.sessionTimeoutMs` becomes an idle timeout.** This is the one change in the bump that needs a product decision (TL;DR).
  - 0.82.0, c543585: the `limits.max*PerSession` options are replaced by `limits.sessionUsage`, with a default of 40M new input tokens per window. Arnold sets none of them (it caps per turn in `agent/hooks/turn-limits.ts`), but the default limit is new. A session that can't ask for a continuation fails with `SESSION_USAGE_LIMIT_REACHED`, so check how the eve channel handles it.
  - 0.82.0: the eve channel's `onMessage` can read and replace `clientContext` (f9ea546). Sends accept `idempotencyKey` (a9f5065). Both are additive.
  - 0.83.0, 12a1e90: `DefaultSandbox` selects its provider once, at `eve build`, and records it. On Vercel that's Vercel Sandbox. Elsewhere it's Docker when a daemon answers, and just-bash only in `eve dev` / `eve eval` (`docs/sandbox/default.mdx` in 0.83.3). Recorded sessions are stored under `"default"`. This is **one-way**: rolling back below 0.83 breaks sessions created on it.
  - 0.83.0: the custom-provider API was rewritten (5b27aa8, 3f698dd). Arnold has no custom provider, but this rules out writing option C against 0.80.0 first.
  - 0.83.1: background sandbox resume (3fbef89) and the bytes cache (6f551a7).
  - 0.84.0 replaces lifecycle maps in `defineDynamic` (4a4951e), which `agent/agent.ts` uses for the model. Stay on 0.83.x, or take that change separately.
- **Pins outside `apps/arnold`.** `apps/mobile/package.json:57` pins `eve` 0.80.0 too, for the client with `@assistant-ui/eve` 0.0.24 (`:20`). Move both apps together, or confirm the 0.80 client still reads a 0.83 server's stream **(unverified)**. `pnpm-workspace.yaml:28-33` overrides `eve>undici` for FIT-328 and notes eve still pins a vulnerable undici in 0.83.2. Keep the override and re-check it on 0.83.3.
- **Testing.** I grepped the changelog for areas that touch Arnold: limits, hooks, auth, channels, evals, stream and telemetry. Read 0.80.1–0.83.3 in full before the bump, then run `pnpm arnold test` and `pnpm arnold eval`. No CI workflow builds Arnold (`.github/workflows/*.yml` has no `arnold build`), so only Vercel and local runs exercise it.

## 4. Option A: Vercel Sandbox on eve 0.80.0

The same `DefaultSandbox` change without the bump would work, which makes it a possible hotfix. But on 0.80.0:

- every model call in a photo Conversation goes to the sandbox (no cache): a lookup, a command and one read per photo, even while the VM is running. That costs latency, not wakes, since a running VM is reused inside its timeout;
- a gone sandbox breaks attachments for the rest of the session;
- deny-all isn't reachable.

Use it only if the bump can't land quickly. Moving to B later needs no data migration, because 0.83 "resumes the same sandbox" for sessions recorded under the provider `DefaultSandbox` had selected.

## 5. Option C: a custom eve provider on private Vercel Blob (fallback)

### 5.1 What eve needs from a provider

For attachments, eve only calls `writeBinaryFile`, `readBinaryFile` and `resolvePath` (`attachment-staging.js`, `writeSandboxRef` / `readSandboxRefBytes`). It builds those from the provider's byte-level primitives (`dist/src/execution/sandbox/session.js`).

On eve 0.83.x, a provider implements a `SandboxConnection` (`docs/sandbox/custom-providers.mdx` in 0.83.3):

- `spawn` can reject, since Arnold runs no commands;
- `readFile(path)` answers the bytes, or `null` when the path doesn't exist;
- `writeFiles(files)`;
- `removePath`;
- `stop` is a no-op;
- the lifecycle methods are `prepare` (return `{}` when `ctx.isEmpty`), `start`, `resume` and `onSessionEnd`. `onSessionEnd` "must succeed when nothing exists and must be idempotent", and must find the data from `ctx.session.id` even when `state` is `null`.

### 5.2 Design

- **Paths.** Key every file by `arnold-attachments/<session id>/<path>` in a **private** Blob store, created in `iad1` and connected to `fitme-arnold` over OIDC. Connecting it sets `BLOB_STORE_ID`, and the SDK uses the rotating `VERCEL_OIDC_TOKEN`, so no long-lived token is needed ([Blob: OIDC access](https://vercel.com/docs/vercel-blob#oidc-access-by-default)).
- **Reads and writes.**
  - A write is `put(…, { access: "private", allowOverwrite: true, ttlDays: 31 })`.
  - A read is `get(…, { access: "private" })`, mapping "not found" to `null`.
  - The repo already reads a private store this way in `apps/library`.
- **TTL backstop.** `ttlDays` (1–730, "counted from the upload") needs `@vercel/blob` **2.9.0**. The repo pins 2.8.2, whose types have no `ttlDays` (checked in the 2.9.0 tarball's `dist/client.d.ts`).
  - On 0.80.0 a Conversation ends 30 days after it starts, and an upload always comes after that start. So 31 days from the upload outlives the session, and a blob that cleanup missed deletes itself.
  - On 0.83.x (idle timeout, §3.7), a Conversation can outlive any fixed TTL. Each read would then have to push the TTL forward (`setTtl`, one advanced operation per started 60 days), unless Arnold enforces the absolute 30 days itself.
- **Deletion.**
  - `onSessionEnd` lists the session's prefix and runs `del` on it. A reset (account deletion) reaches it through the same finalization as §3.3. Deletes are free.
  - Hydration keeps its integrity check, because eve verifies size and hash prefix against the reference.
- **Local development.** Keep `eve dev` on just-bash, or run `vercel env pull` for OIDC. But eve 0.83 warns against choosing a provider by reading `process.env.VERCEL` when the build and runtime hosts differ (`docs/sandbox/troubleshooting.mdx`, provider mismatch). The safe shape is one provider whose storage falls back to memory outside Vercel. The bug's lesson applies here too: local `eve dev` must not be what proves it works.

### 5.3 Cost and latency

[Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing), Pro, `iad1`: storage $0.023/GB-month, advanced operations $5 per million (an upload, plus one per started 60 days of TTL), simple operations $0.40 per million, Blob Data Transfer $0.05/GB, deletes free.

- Ten 400 KB photos cost $0.0001 to upload and store for a month.
- A model step reading all 10 (4 MB) costs about $0.0002. Reads from a Function go through the CDN, so repeats can be cache hits.
- That's **about $0.002 per Conversation**.
- Latency is N parallel reads inside one region, likely tens of milliseconds **(unverified)**, and it never boots a VM.

### 5.4 What it costs us

- About 150 lines of provider plus tests (`createFakeLibrary`-style in-memory fake).
- A private store to create, connect and keep out of other projects.
- `@vercel/blob` 2.9 in `apps/arnold`.
- A provider contract still in preview: it broke in 0.83.0 (5b27aa8, 3f698dd).
- ADR 0018 must say Attachments live in our own Blob store. That's the "Upload to … Vercel Blob" option the ADR considered and turned down, minus the URL and `fetchFile` part.

## 6. Options that don't work

- **Ship the just-bash template, or point `storagePath` at `/tmp`.** `/var/task` is read-only at runtime. `/tmp` is per instance, and a later workflow step can land on another instance, so hydration would read nothing. eve's 0.79.2 changelog entry bc4edd9 ("when a follow-up lands on another replica") describes exactly that failure.
- **Vercel Sandbox Drive** ([Drives](https://vercel.com/docs/sandbox/concepts/drives); `docs/sandbox/vercel.mdx`, "Mount a Drive"):
  - A Drive is mounted into a running VM, so it has B's wake cost and latency plus Drive storage.
  - eve stages into `/workspace/.eve/attachments`, which the docs say to keep separate from Drive mounts.
  - A Drive takes one read-write mount at a time, so it needs a name per session.
  - It adds nothing over the sandbox's own snapshot.
- **Provider file references.** eve leaves a file part whose data is `{ type: "reference" }` or a provider-reference map (an object of strings) in history without staging it (`readFileData` in `dist/src/internal/attachments/data.js`). That means an AI SDK provider's Files API ID. Arnold switches between four model creators per turn through AI Gateway, with fallback hosts (ADR 0020), so a file uploaded to one provider is useless to the next. It would also store User photos at each provider.
- **URL file parts with our own storage.** eve downloads a link itself (`fetchFile`, or a public `https:` fetch) and then stages the bytes into the sandbox (`stageFilePart` → `resolveLink` → `stageResolvedBytes`). That doesn't bypass the sandbox. `toolOutputPart.fileUrl` (0.83+) skips staging, but only for tool results, never for a User's message.
- **No sandbox-free hook.** Staging and hydration are internal harness functions with no public extension point in 0.80.0, 0.83.3 or 1.0.0-rc.17. rc.17 adds the cache and changes the docs' wording, but staging still requires a sandbox: "could not be stored: no sandbox is available".
- **Describe each image once in text.** A vision call at intake could store a text description. Arnold could then no longer look at a form still or a plan screenshot again, and the image rules in `agent/instructions.md` (read the plan, give feedback on body photos) depend on the pixels.

## 7. What the fix changes, and how to verify it

### 7.1 Files

- **`apps/arnold/package.json:24`:** `eve` `0.80.0` → `0.83.3`. Keep `just-bash` (line 25) for `eve dev` / `eve eval` without Docker. Move `apps/mobile/package.json:57` (`eve`) with it, and check `@assistant-ui/eve` (§3.7).
- **The Conversation lifetime (eve 0.82.0's idle timeout).** Choose one:
  - Keep absolute 30-day Conversations, and make Arnold end them itself.
  - Accept idle-based ones, and update together the `agent/agent.ts:19-21` comment, AGENTS.md (Arnold, "Conversations end 30 days after they start"), the privacy policy (`apps/site/app/privacy-policy/page.tsx:97-105` and `:234-242`, which say a Conversation "ends 30 days after it starts") and the store listing text if it repeats that.
- **`apps/arnold/agent/sandbox.ts:1-9`:** `DefaultSandbox.environment({ justBash: { autoInstall: false }, vercel: { … } })` with the options from the TL;DR. Keep `defineSandbox(() => environment.open())`. Rewrite the comment: the sandbox exists to hold Attachments (ADR 0018), and it's Vercel Sandbox on Vercel.
- **`apps/arnold/test/`:** a unit test on the exported environment's options, in the style of `test/upload-policy.test.ts`: 31-day snapshot expiry, retention of one, deny-all, 1 vCPU, 5-minute timeout.
- **`AGENTS.md:305`:** replace "just-bash (in-process, nothing to build or pay for)". It becomes: `DefaultSandbox`, so Vercel Sandbox on Vercel (Attachments are staged and read back there), Docker or just-bash locally, plus the options and why each exists. Say that local just-bash can't reproduce production. Also mention the cost per wake, and that a reset deletes the sandbox and its snapshots.
- **ADR 0018** (`docs/adr/0018-…md:8`): "eve keeps the bytes in the session" stays true. Add that eve keeps them in the session's Vercel Sandbox, snapshotted between turns, and deletes them when the session ends or is reset, with a 31-day snapshot expiry as the backstop. Add as a consequence that each wake of a photo Conversation costs about $0.0035 and adds resume latency.
- **Privacy policy** (`apps/site/app/privacy-policy/page.tsx:97-105`, `:234-242`): it already says Vercel keeps a Conversation's photos and deletes every copy no later than 96 days after the Conversation ends. With a 31-day backstop the deletion promise stays true, so storage alone needs no change. The idle-timeout decision above may still change its "ends 30 days after it starts". Re-read it if option C lands, since a Blob store with a TTL is a different processor feature under the same vendor.
- **Vercel:** nothing to configure for B. OIDC is already in place. Sandbox usage appears under the project's Sandboxes page. Consider a Spend Management alert.

### 7.2 Verifying on a deployment

Local `eve dev` with just-bash hides the bug, so verify on a deployment with a Pro test User.

**Reaching a preview.** `fitme-arnold` has Vercel SSO protection on every domain except its custom ones (`ssoProtection: all_except_custom_domains`, from the Vercel MCP's `get_project`). The app can't reach a preview URL as it is. Drive the eve routes with `curl` instead:

- add Protection Bypass for Automation (the `x-vercel-protection-bypass` header);
- send a Clerk development session token for a User who is Pro on RevenueCat, since previews verify against the development instance's `CLERK_JWT_KEY`;
- send each photo as a `data:image/jpeg;base64,…` file part.

Otherwise verify in production through the app, on `arnold.fitmeproject.com`.

1. **Build log.** It shows `DefaultSandbox` selected Vercel and prepared no template.
2. **First photo.** Send a photo with a recognisable detail, then ask about it. The answer must describe it. Arnold's logs must show no `session sandbox unavailable` and no `could not be stored`. Under the project's Sandboxes page an `eve-sbx-vercel-…` sandbox appears with 1 vCPU, the deny-all policy and a `sessionId` tag. Read-only Vercel MCP tools can show it too.
3. **Cross the timeout.** Wait more than 5 minutes, until the sandbox is stopped with exactly one snapshot. Then send a **text-only** follow-up about the photo. The answer must still use it, with no `FileNotFound`. This is the test that matters: an answer from the same warm minute proves nothing. Repeat after the instance has gone cold to see a real resume.
4. **Measure.** In the traces (the eve step spans, exported to Sentry), compare the step before the model call on a warm step against a resumed step. Apply the threshold: p95 added latency over about 1.5 s, or Sandbox spend per photo Conversation over about $0.10, means option C.
5. **Reset.** Start a new Conversation with "+", which resets the eve session, or call the reset route the account-deletion webhook uses. Confirm the sandbox **and its snapshots** are gone once finalization has run. Finalization runs asynchronously in the session workflow, so allow some time.
6. **Old Conversations.** A Conversation whose photos were sent before the fix still answers, its old photos read as notes, and a newly sent photo works.
