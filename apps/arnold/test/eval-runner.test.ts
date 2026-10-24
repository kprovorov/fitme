import { describe, expect, it, vi } from "vitest";
import { admitTurn } from "../agent/lib/conversation";
import { evalRunner, isLocalEvalRun } from "../agent/lib/eval-runner";
import { conversationOwner } from "../agent/lib/owner";

/** What `eve eval` sets on the dev server it boots in its own process. */
const EVAL_RUN = { EVE_DEV: "1", EVE_EVALUATION: "1" };

const request = () =>
  new Request("http://127.0.0.1:3005/eve/v1/session", { method: "POST" });

describe("isLocalEvalRun", () => {
  it("is true only on the dev server `eve eval` boots", () => {
    expect(isLocalEvalRun(EVAL_RUN)).toBe(true);
    expect(isLocalEvalRun({})).toBe(false);
    // plain `eve dev`
    expect(isLocalEvalRun({ EVE_DEV: "1" })).toBe(false);
    // the flag alone, outside a dev server
    expect(isLocalEvalRun({ EVE_EVALUATION: "1" })).toBe(false);
    // anywhere on Vercel, whatever else is set
    expect(isLocalEvalRun({ ...EVAL_RUN, VERCEL: "1" })).toBe(false);
  });
});

describe("evalRunner", () => {
  it("admits the local eval runner, allowed to stub tools", async () => {
    const caller = await evalRunner(() => EVAL_RUN)(request());

    expect(caller).toMatchObject({
      allowToolStubs: true,
      authenticator: "local-dev",
    });
    // never a Clerk User, so no real tool can act for anyone
    expect(
      conversationOwner({ current: caller, initiator: caller } as never)
    ).toBeNull();
  });

  it("admits nobody outside a local eval run", async () => {
    const callers = await Promise.all(
      [{}, { EVE_DEV: "1" }, { ...EVAL_RUN, VERCEL: "1" }].map((env) =>
        evalRunner(() => env)(request())
      )
    );

    expect(callers).toEqual([null, null, null]);
  });
});

describe("admitTurn for the eval runner", () => {
  const runner = {
    attributes: {},
    authenticator: "local-dev",
    principalId: "local-dev",
    principalType: "local-dev",
  };
  const deps = (evalRun: boolean) => ({
    claim: vi.fn(),
    isEvalRun: () => evalRun,
    report: vi.fn(),
  });

  it("lets its turns run without recording the session", async () => {
    const { claim, isEvalRun, report } = deps(true);

    expect(
      await admitTurn(
        { auth: { current: runner, initiator: runner }, sessionId: "wrun_1" },
        { claim, isEvalRun, report }
      )
    ).toBe(true);
    expect(claim).not.toHaveBeenCalled();
  });

  it("refuses a local-dev caller outside a local eval run", async () => {
    const { claim, isEvalRun, report } = deps(false);

    expect(
      await admitTurn(
        { auth: { current: runner, initiator: runner }, sessionId: "wrun_1" },
        { claim, isEvalRun, report }
      )
    ).toBe(false);
    expect(claim).not.toHaveBeenCalled();
  });
});
