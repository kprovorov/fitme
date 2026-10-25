import type { Exercise, Library } from "@fitme/library-sdk";
import { createFakeLibrary } from "@fitme/library-sdk/fake";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ToolContext } from "../context.js";
import { createMcpServer } from "../server.js";
import type { UserServices } from "../services.js";

export const PLAN_ID = "11111111-1111-4111-8111-111111111111";
export const SESSION_ID = "22222222-2222-4222-8222-222222222222";
export const SET_ID = "33333333-3333-4333-8333-333333333333";
export const WORKOUT_ID = "44444444-4444-4444-8444-444444444444";

/** The Exercises the default fake Library knows. */
export const BENCH: Exercise = {
  description: "Lie on a flat bench and press the bar.",
  instructions: "1. Unrack. 2. Lower to the chest. 3. Press.",
  muscle_groups: ["chest", "triceps"],
  name: "Bench Press",
  slug: "bench-press",
  thumbnail_url: "https://media.test/bench-press.jpg",
  video_url: "https://media.test/bench-press.mp4",
};
export const SQUAT: Exercise = {
  description: "A squat with the bar on the upper back.",
  instructions: "1. Unrack. 2. Squat. 3. Stand up.",
  muscle_groups: ["quadriceps", "glutes"],
  name: "Barbell Back Squat",
  slug: "barbell-back-squat",
  thumbnail_url: "https://media.test/barbell-back-squat.jpg",
  video_url: "https://media.test/barbell-back-squat.mp4",
};

/** A fake Library knowing BENCH and SQUAT, fresh per call. */
export const fakeLibrary = (exercises: Exercise[] = [BENCH, SQUAT]) =>
  createFakeLibrary(exercises);

const notFaked = (name: keyof UserServices) => () =>
  Promise.reject(new Error(`${name} is not faked.`));

/** Services where every method a test didn't fake fails the call. */
export const fakeServices = (faked: Partial<UserServices>): UserServices => ({
  activatePlan: notFaked("activatePlan"),
  createPlan: notFaked("createPlan"),
  deletePlan: notFaked("deletePlan"),
  deleteWorkoutSession: notFaked("deleteWorkoutSession"),
  finishWorkoutSession: notFaked("finishWorkoutSession"),
  getExerciseHistory: notFaked("getExerciseHistory"),
  getPlan: notFaked("getPlan"),
  getProfile: notFaked("getProfile"),
  getWorkoutSession: notFaked("getWorkoutSession"),
  listPlans: notFaked("listPlans"),
  listWorkoutSessions: notFaked("listWorkoutSessions"),
  logSet: notFaked("logSet"),
  startWorkoutSession: notFaked("startWorkoutSession"),
  updatePlan: notFaked("updatePlan"),
  ...faked,
});

/** A reporter recording every error it is handed. */
export const recordingReporter = () => {
  const reported: unknown[] = [];
  const reportError: ToolContext["reportError"] = (error) => {
    reported.push(error);
    return Promise.resolve();
  };
  return { reportError, reported };
};

export const ignoreReports: ToolContext["reportError"] = () =>
  Promise.resolve();

/** A context whose user tools run on `services` and `library`. */
export const contextFor = (
  services: UserServices,
  reportError: ToolContext["reportError"] = ignoreReports,
  library: Library = fakeLibrary()
): ToolContext => ({
  getLibrary: () => library,
  getServices: () => services,
  reportError,
});

/** For tests that never reach a user tool. */
const NO_USER: ToolContext = {
  getLibrary: () => {
    throw new Error("No Library in this test.");
  },
  getServices: () => {
    throw new Error("No User in this test.");
  },
  reportError: ignoreReports,
};

export async function connect(context: ToolContext = NO_USER) {
  const server = createMcpServer({ context });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

/**
 * Connects a client whose service-backed tools run on `faked` services and
 * whose Exercise tools run on `library` (default: BENCH and SQUAT).
 */
export const connectWithServices = (
  faked: Partial<UserServices>,
  reportError?: ToolContext["reportError"],
  library?: Library
) => connect(contextFor(fakeServices(faked), reportError, library));

export interface ToolOutcome {
  isError: boolean;
  /** Parsed JSON payload (only for successful results). */
  json: Record<string, unknown>;
  text: string;
}

export async function call(
  client: Client,
  name: string,
  args: Record<string, unknown> = {}
): Promise<ToolOutcome> {
  const result = await client.callTool({ arguments: args, name });
  const content = Array.isArray(result.content) ? result.content : [];
  const [first] = content;
  const text = first?.type === "text" ? String(first.text) : "";
  const isError = result.isError === true;
  return { isError, json: isError ? {} : JSON.parse(text), text };
}
