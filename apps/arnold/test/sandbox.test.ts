import { describe, expect, it } from "vitest";

import { vercelSandboxOptions } from "../agent/sandbox";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

// agent/agent.ts: a Conversation ends after 30 idle days.
const CONVERSATION_IDLE_DAYS = 30;

describe("Arnold's Vercel Sandbox, where eve keeps a Conversation's Attachments", () => {
  it("runs the smallest VM and stops it 5 minutes after a turn", () => {
    expect(vercelSandboxOptions.resources).toStrictEqual({ vcpus: 1 });
    expect(vercelSandboxOptions.timeout).toBe(5 * MINUTE_MS);
  });

  it("has no network", () => {
    expect(vercelSandboxOptions.networkPolicy).toBe("deny-all");
  });

  it("keeps one snapshot, which outlives an idle Conversation", () => {
    expect(vercelSandboxOptions.keepLastSnapshots).toStrictEqual({ count: 1 });
    expect(vercelSandboxOptions.snapshotExpiration).toBeGreaterThan(
      CONVERSATION_IDLE_DAYS * DAY_MS
    );
    expect(vercelSandboxOptions.snapshotExpiration).toBe(31 * DAY_MS);
  });
});
