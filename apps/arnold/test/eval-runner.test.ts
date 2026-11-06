import { describe, expect, it, vi } from "vitest";

import { admitTurn } from "../agent/lib/conversation";
import { evalRunner, isLocalEvalRun } from "../agent/lib/eval-runner";
import { conversationOwner } from "../agent/lib/owner";

/** What `eve eval` sets on the dev server it boots in its own process. */
const EVAL_RUN = { EVE_DEV: "1", EVE_EVALUATION: "1" };

const request = () =>
  new Request("http://127.0.0.1:3005/eve/v1/session", { method: "POST" });

const deps = (evalRun: boolean) => ({
  claim: vi.fn<Parameters<typeof admitTurn>[1]["claim"]>(),
  isEvalRun: () => evalRun,
  report: vi.fn<Parameters<typeof admitTurn>[1]["report"]>(),
});

describe("local eval run detection", () => {
  it("is true only on the dev server `eve eval` boots", () => {
    expect(isLocalEvalRun(EVAL_RUN)).toBeTruthy();
    expect(isLocalEvalRun({})).toBeFalsy();
    // plain `eve dev`
    expect(isLocalEvalRun({ EVE_DEV: "1" })).toBeFalsy();
    // the flag alone, outside a dev server
    expect(isLocalEvalRun({ EVE_EVALUATION: "1" })).toBeFalsy();
    // anywhere on Vercel, whatever else is set
    expect(isLocalEvalRun({ ...EVAL_RUN, VERCEL: "1" })).toBeFalsy();
  });
});

describe("eval runner authentication", () => {
  it("admits the local eval runner, allowed to stub tools", async () => {
    const caller = await evalRunner(() => EVAL_RUN)(request());

    if (!caller) {
      throw new Error("Expected the local eval runner to be admitted");
    }

    expect(caller).toMatchObject({
      allowToolStubs: true,
      authenticator: "local-dev",
    });
    // never a Clerk User, so no real tool can act for anyone
    expect(
      conversationOwner({ current: caller, initiator: caller })
    ).toBeNull();
  });

  it("admits nobody outside a local eval run", async () => {
    const callers = await Promise.all(
      [{}, { EVE_DEV: "1" }, { ...EVAL_RUN, VERCEL: "1" }].map(
        async (env) => await evalRunner(() => env)(request())
      )
    );

    expect(callers).toStrictEqual([null, null, null]);
  });
});

describe("admitTurn for the eval runner", () => {
  const runner = {
    attributes: {},
    authenticator: "local-dev",
    principalId: "local-dev",
    principalType: "local-dev",
  };

  it("lets its turns run without recording the session", async () => {
    const { claim, isEvalRun, report } = deps(true);

    await expect(
      admitTurn(
        { auth: { current: runner, initiator: runner }, sessionId: "wrun_1" },
        { claim, isEvalRun, report }
      )
    ).resolves.toBeTruthy();
    expect(claim).not.toHaveBeenCalled();
  });

  it("refuses a local-dev caller outside a local eval run", async () => {
    const { claim, isEvalRun, report } = deps(false);

    await expect(
      admitTurn(
        { auth: { current: runner, initiator: runner }, sessionId: "wrun_1" },
        { claim, isEvalRun, report }
      )
    ).resolves.toBeFalsy();
    expect(claim).not.toHaveBeenCalled();
  });
});
