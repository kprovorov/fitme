import { createLibraryIndex } from "@fitme/library-bundle/library-index";
import type { LibraryIndex } from "@fitme/library-bundle/library-index";
import type {
  BundleV2Exercise,
  LibraryBundleV2,
} from "@fitme/library-bundle/v2";
import { createLibraryV2 } from "@fitme/library-bundle/v2/library";
import type { LibraryV2 } from "@fitme/library-bundle/v2/library";
import type { Cover } from "@fitme/library-sdk";
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

/** The Supabase project the test Library's media URLs are on. */
export const TEST_SUPABASE_URL = "https://project.supabase.co";

const textOf = (name: string) => ({
  benefits: [`${name} builds strength.`],
  common_mistakes: [`Rushing the ${name.toLowerCase()}.`],
  long_description: `${name}, described at length.`,
  name,
  short_description: `${name} in a line.`,
  steps: [`Set up for the ${name.toLowerCase()}.`, "Lift.", "Lower."],
  tags: ["strength"],
  use_cases: ["Building strength."],
});

/** A made-up v2 bundle Exercise named `name`, overridable field by field. */
export const bundleExercise = (
  slug: string,
  name: string,
  overrides: Partial<BundleV2Exercise> = {}
): BundleV2Exercise => ({
  aliases: [],
  difficulty: "beginner",
  equipment: ["bodyweight"],
  locales: { en: textOf(name) },
  movement_patterns: ["push"],
  muscle_groups: ["chest"],
  secondary_muscle_groups: [],
  slug,
  thumbnail: { extension: "webp", oid: "a".repeat(64) },
  video: { extension: "mp4", oid: "b".repeat(64) },
  ...overrides,
});

/** The Exercises the default test Library (and index) knows. */
export const BENCH = bundleExercise("bench-press", "Bench Press", {
  aliases: ["Flat press"],
  difficulty: "intermediate",
  equipment: ["barbell", "bench"],
  secondary_muscle_groups: ["triceps", "shoulders"],
});

export const SQUAT = bundleExercise(
  "barbell-back-squat",
  "Barbell Back Squat",
  {
    difficulty: "intermediate",
    equipment: ["barbell"],
    movement_patterns: ["squat"],
    muscle_groups: ["quadriceps", "glutes"],
    secondary_muscle_groups: ["core"],
  }
);

/** The error a failing test Library load rejects with. */
export const LIBRARY_OUTAGE = new Error("The v2 bundle is unavailable");

/**
 * The instance's Library (ADR 0022) over a v2 bundle of `exercises` (by
 * default BENCH and SQUAT) and `replacedSlugs`, built by the same loader the
 * server uses. With `loads: "fail"` every load rejects with LIBRARY_OUTAGE,
 * which the Library reports through `reportError`.
 */
export const testLibrary = ({
  exercises = [BENCH, SQUAT],
  loads = "ok",
  replacedSlugs,
  reportError = ignoreReports,
}: {
  exercises?: BundleV2Exercise[];
  loads?: "fail" | "ok";
  replacedSlugs?: Record<string, string>;
  reportError?: ToolContext["reportError"];
} = {}): LibraryV2 => {
  const bundle: LibraryBundleV2 = { exercises, version: 2 };

  if (replacedSlugs) {
    bundle.replaced_slugs = replacedSlugs;
  }

  return createLibraryV2({
    load: () =>
      loads === "fail"
        ? Promise.reject(LIBRARY_OUTAGE)
        : Promise.resolve(bundle),
    reportError,
    supabaseUrl: TEST_SUPABASE_URL,
  });
};

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
  exercises?: readonly { muscle_groups: readonly string[]; slug: string }[];
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
  listExerciseNotes: notFaked("listExerciseNotes"),
  listPlans: notFaked("listPlans"),
  listWorkoutSessions: notFaked("listWorkoutSessions"),
  logSet: notFaked("logSet"),
  removeSetFromWorkoutSession: notFaked("removeSetFromWorkoutSession"),
  setExerciseNote: notFaked("setExerciseNote"),
  setWorkoutSessionSetNote: notFaked("setWorkoutSessionSetNote"),
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
  library: LibraryV2 = testLibrary({ reportError }),
  libraryIndex: LibraryIndex = testIndex({ reportError })
): ToolContext => ({
  getServices: () => services,
  library,
  libraryIndex,
  reportError,
});

/** For tests that never reach a user tool. */
const NO_USER: ToolContext = {
  getServices: () => {
    throw new Error("No User in this test.");
  },
  library: {
    get: () => Promise.reject(new Error("No Library in this test.")),
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
  library?: LibraryV2,
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
