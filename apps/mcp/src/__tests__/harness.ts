import { createLibraryIndex } from "@fitme/library-bundle/library-index";
import type { LibraryIndex } from "@fitme/library-bundle/library-index";
import type { Cover, Exercise, Library } from "@fitme/library-sdk";
import { createFakeLibrary } from "@fitme/library-sdk/fake";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import type { JSONType } from "zod";

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
  equipment: [],
  instructions: "1. Unrack. 2. Lower to the chest. 3. Press.",
  muscle_groups: ["chest", "triceps"],
  name: "Bench Press",
  slug: "bench-press",
  thumbnail_url: "https://media.test/bench-press.jpg",
  video_url: "https://media.test/bench-press.mp4",
};

export const SQUAT: Exercise = {
  description: "A squat with the bar on the upper back.",
  equipment: [],
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

export const ignoreReports: ToolContext["reportError"] = () =>
  Promise.resolve();

/** The error a failing test index load rejects with. */
export const INDEX_OUTAGE = new Error("Blob is unavailable");

/**
 * A Library index (ADR 0018) over `exercises` and `covers` in memory, as the
 * bundle would list them: by default BENCH and SQUAT, as the fake Library,
 * and no Covers. With `loads: "fail"` every load rejects with INDEX_OUTAGE,
 * which the index reports through `reportError`: an instance with no index.
 */
export const testIndex = ({
  covers = [],
  exercises = [BENCH, SQUAT],
  loads = "ok",
  reportError = ignoreReports,
}: {
  covers?: readonly Pick<Cover, "id" | "muscle_groups">[];
  exercises?: readonly Pick<Exercise, "muscle_groups" | "slug">[];
  loads?: "fail" | "ok";
  reportError?: ToolContext["reportError"];
} = {}): LibraryIndex =>
  createLibraryIndex({
    load: () =>
      loads === "fail"
        ? Promise.reject(INDEX_OUTAGE)
        : Promise.resolve({
            covers: covers.map(({ id, muscle_groups }) => ({
              id,
              muscle_groups,
            })),
            exercises: exercises.map(({ muscle_groups, slug }) => ({
              muscle_groups,
              slug,
            })),
            version: 1,
          }),
    reportError,
  });

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

/**
 * A context whose user tools run on `services`, whose reads and searches run
 * on `library` and whose Plan writes check slugs and pick Covers against
 * `libraryIndex` (default: both over BENCH and SQUAT, no Covers).
 */
export const contextFor = (
  services: UserServices,
  reportError: ToolContext["reportError"] = ignoreReports,
  library: Library = fakeLibrary(),
  libraryIndex: LibraryIndex = testIndex({ reportError })
): ToolContext => ({
  getLibrary: () => library,
  getServices: () => services,
  libraryIndex,
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
  libraryIndex: {
    lookup: () => Promise.reject(new Error("No Library index in this test.")),
  },
  reportError: ignoreReports,
};

export const connect = async (context: ToolContext = NO_USER) => {
  const server = createMcpServer({ context });

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return client;
};

/**
 * Connects a client whose service-backed tools run on `faked` services, whose
 * Exercise tools run on `library` and whose Plan writes check against
 * `libraryIndex` (default: both over BENCH and SQUAT).
 */
export const connectWithServices = (
  faked: Partial<UserServices>,
  reportError?: ToolContext["reportError"],
  library?: Library,
  libraryIndex?: LibraryIndex
) =>
  connect(contextFor(fakeServices(faked), reportError, library, libraryIndex));

export interface ToolOutcome {
  isError: boolean;
  /** Parsed JSON payload (only for successful results). */
  json: Record<string, JSONType>;
  text: string;
}

export const call = async (
  client: Client,
  name: string,
  args: NonNullable<CallToolRequest["params"]["arguments"]> = {}
): Promise<ToolOutcome> => {
  const result = await client.callTool({ arguments: args, name });
  const content = Array.isArray(result.content) ? result.content : [];
  const [first] = content;
  const text = first?.type === "text" ? String(first.text) : "";
  const isError = result.isError === true;

  return { isError, json: isError ? {} : JSON.parse(text), text };
};
