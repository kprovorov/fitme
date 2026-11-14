import { DefaultSandbox, defineSandbox } from "eve/sandbox";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

// Arnold runs no shell, file or web tools (defaultTools: false). It needs a
// sandbox for one thing: eve stages every Attachment (ADR 0018) into the
// session's sandbox and reads it back before each model call. So the sandbox
// has to keep its files between workflow steps, for the whole Conversation.
//
// On Vercel, DefaultSandbox is a persistent Vercel Sandbox: eve starts it on
// the first Attachment (a text-only Conversation never opens one), it stops
// when idle and Vercel snapshots its disk, and the next model call resumes it.
// eve deletes it, snapshots included, when the session ends or is reset
// (account deletion). Locally it's Docker or just-bash, which keep files only
// on this machine: `eve dev` can't reproduce a production sandbox problem.
export const vercelSandboxOptions = {
  // Nothing runs in it, so the smallest VM (1 vCPU, 2 GB): memory is billed
  // for as long as it runs.
  resources: { vcpus: 1 },
  // Stop soon after a turn: a resume per wake is cheaper than billed idle
  // memory (eve's default is 30 minutes).
  timeout: 5 * MINUTE_MS,
  // Nothing in it needs the network.
  networkPolicy: "deny-all",
  // A snapshot's expiry restarts on every resume, and a Conversation ends
  // after 30 idle days, so 31 days always outlives it. It's also the backstop
  // when eve's cleanup at session end fails.
  snapshotExpiration: 31 * DAY_MS,
  // Each wake writes a new snapshot; only the latest is ever read.
  keepLastSnapshots: { count: 1 },
} as const;

export const environment = DefaultSandbox.environment({
  justBash: { autoInstall: false },
  vercel: vercelSandboxOptions,
});

export default defineSandbox(async () => await environment.open());
