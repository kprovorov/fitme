import type { EveAuthFn } from "eve/channels/eve";
import type { SessionContext } from "eve/context";

type Env = Record<string, string | undefined>;

/**
 * Whether this is the dev server a local `eve eval` boots in its own process:
 * it sets `EVE_EVALUATION`, and the dev server `EVE_DEV`. Never on Vercel,
 * whatever else is set there.
 */
export const isLocalEvalRun = (env: Env = process.env): boolean =>
  env.EVE_EVALUATION === "1" && env.EVE_DEV === "1" && env.VERCEL === undefined;

/** eve's own local-dev principal: not a Clerk User, so no tool acts as it. */
const EVAL_RUNNER = {
  attributes: {},
  authenticator: "local-dev",
  principalId: "local-dev",
  principalType: "local-dev",
} as const;

/**
 * Route auth for a local `eve eval` run only: the runner sends no token, so
 * it gets eve's local-dev principal with permission to stub tools (an eve
 * channel permission since eve 1.0, hence `EveAuthFn`). The local-dev
 * principal is an operator, so it reads agent info without `allowAgentInfo`.
 * Anywhere else it admits nobody, and the channel stays Clerk-only.
 */
export const evalRunner = (env: () => Env = () => process.env): EveAuthFn =>
  function authenticateEvalRunner() {
    return isLocalEvalRun(env())
      ? { ...EVAL_RUNNER, allowToolStubs: true }
      : null;
  };

type SessionAuth = SessionContext["session"]["auth"];

/** A turn the local eval runner started and sends. */
export const isEvalRunnerTurn = ({ current, initiator }: SessionAuth) =>
  initiator?.authenticator === EVAL_RUNNER.authenticator &&
  current?.authenticator === EVAL_RUNNER.authenticator;
