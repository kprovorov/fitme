import type { LegacyMuscleGroup } from "@fitme/core/models";
import { createLibraryIndex } from "@fitme/library-bundle/library-index";
import type {
  IndexCover,
  IndexExercise,
  LibraryIndex,
} from "@fitme/library-bundle/library-index";
import { memoryRateLimiter } from "@fitme/rate-limit";

import { createApp } from "../create-app.js";
import type { AppDeps } from "../create-app.js";
import type { RateLimiter } from "../rate-limit.js";
import type { UserServices } from "../services.js";
import { clerkInstance, clerkToken } from "./clerk.js";

/** The Clerk instance the test app trusts. */
export const clerk = clerkInstance();

/** `Authorization: Bearer` with a session token for `userId` from the trusted instance. */
export const signedInAs = (
  userId: string,
  claims: Parameters<typeof clerkToken>[1] = {}
) => ({
  authorization: `Bearer ${clerkToken(clerk.privateKey, { sub: userId, ...claims })}`,
});

/**
 * Services that answer only what a test fakes: calling any other method fails
 * the request (and so the test) with a reported 500.
 */
export const fakeServices = (faked: Partial<UserServices>): UserServices =>
  // SAFETY: Supplied methods match UserServices; the proxy replaces missing methods with a throwing fallback.
  new Proxy(faked as UserServices, {
    get: (target, method: string) =>
      // SAFETY: Service callers use UserServices keys; missing methods use the throwing fallback below.
      target[method as keyof UserServices] ??
      (() => {
        throw new Error(`Unfaked service method: ${method}`);
      }),
  });

/** An Exercise the test Library knows, by slug (quadriceps unless told otherwise). */
export const libraryExercise = (
  slug: string,
  muscleGroups: LegacyMuscleGroup[] = ["quadriceps"]
): IndexExercise => ({ muscle_groups: muscleGroups, slug });

/** A Cover the test Library has, by id, tagged with `muscleGroups`. */
export const libraryCover = (
  id: string,
  muscleGroups: LegacyMuscleGroup[]
): IndexCover => ({ id, muscle_groups: muscleGroups });

/** The Exercises the test app's Library knows by default. */
export const KNOWN_SLUGS = ["barbell-back-squat", "barbell-deadlift"];

/** How a test's Library index loads its bundle. */
export type IndexLoads =
  /** Every load answers the bundle. */
  | "ok"
  /** Every load fails: an instance with no index, which answers 503. */
  | "fail"
  /** The first load answers the bundle and every reload fails. */
  | "reload-fails";

/** The error a failing test index load rejects with. */
const indexOutage = () => new Error("Blob is unavailable");

/**
 * A Library index over `exercises` and `covers` in memory, as the Library
 * API's bundle would list them, on a clock tests move through `clock.now`.
 * `loads` counts its loads, and `loading` decides how they go.
 */
export const testLibraryIndex = ({
  covers = [],
  exercises = KNOWN_SLUGS.map((slug) => libraryExercise(slug)),
  loading = "ok",
  reportError,
}: {
  covers?: readonly IndexCover[];
  exercises?: readonly IndexExercise[];
  loading?: IndexLoads;
  reportError: (error: Error) => Promise<void>;
}) => {
  const clock = { now: 0 };
  const state = { loads: 0, outage: indexOutage() };

  const bundle = {
    covers: covers.map((cover) => ({
      id: cover.id,
      muscle_groups: cover.muscle_groups,
    })),
    exercises: exercises.map((exercise) => ({
      muscle_groups: exercise.muscle_groups,
      slug: exercise.slug,
    })),
    version: 1,
  };

  const index = createLibraryIndex({
    load: () => {
      state.loads += 1;

      const fails =
        loading === "fail" || (loading === "reload-fails" && state.loads > 1);

      return fails ? Promise.reject(state.outage) : Promise.resolve(bundle);
    },
    now: () => clock.now,
    reportError,
  });

  return { clock, index, state };
};

/**
 * A Library index over `exercises` and `covers` that a test can swap for a
 * cold one that can't load (`goCold`, answering the error it reports), and
 * back (`reset`), for suites sharing one app across tests.
 */
export const switchableLibraryIndex = (
  exercises: readonly IndexExercise[],
  {
    covers,
    reportError,
  }: {
    covers?: readonly IndexCover[];
    reportError: (error: Error) => Promise<void>;
  }
) => {
  const warm = testLibraryIndex({ covers, exercises, reportError }).index;
  let current = warm;

  const index: LibraryIndex = { lookup: (slugs) => current.lookup(slugs) };

  return {
    goCold: () => {
      const cold = testLibraryIndex({
        covers,
        exercises,
        loading: "fail",
        reportError,
      });

      current = cold.index;

      return cold.state.outage;
    },
    index,
    reset: () => {
      current = warm;
    },
  };
};

/**
 * The app over fake services and a Library index knowing `KNOWN_SLUGS` and no
 * Covers unless given (`indexLoads` for one that can't load, or can't reload),
 * trusting `clerk`, with a recording reporter and Sentry user. `servicesFor`
 * records the User id each facade was built for; `libraryIndex` is the index
 * with its clock and load count.
 */
export const testApp = (
  options: {
    /** Explicitly `undefined` for an API without CLERK_JWT_KEY. */
    clerkJwtKey?: string;
    /** The Library's Covers; none by default. */
    covers?: IndexCover[];
    /** The Library's Exercises; `KNOWN_SLUGS` by default. */
    exercises?: IndexExercise[];
    /** How the index's loads go; every one succeeds by default. */
    indexLoads?: IndexLoads;
    /** Counts requests; by default one no test reaches (in memory, unlimited in practice). */
    rateLimiter?: RateLimiter;
    services?: UserServices | null;
  } = {}
) => {
  const clerkJwtKey =
    "clerkJwtKey" in options ? options.clerkJwtKey : clerk.jwtKey;

  const services =
    options.services === undefined ? fakeServices({}) : options.services;

  const reported: unknown[] = [];
  const identified: string[] = [];
  const servicesFor: string[] = [];

  const reportError = (error: unknown) => {
    reported.push(error);

    return Promise.resolve();
  };

  const libraryIndex = testLibraryIndex({
    covers: options.covers,
    exercises: options.exercises,
    loading: options.indexLoads,
    reportError,
  });

  const deps: AppDeps = {
    clerkJwtKey,
    createServices: (userId) => {
      servicesFor.push(userId);

      return services;
    },
    identifyUser: (userId) => {
      identified.push(userId);
    },
    libraryIndex: libraryIndex.index,
    rateLimiter:
      options.rateLimiter ??
      memoryRateLimiter({ limit: Number.MAX_SAFE_INTEGER, windowMs: 60_000 }),
    reportError,
  };

  return {
    app: createApp(deps),
    identified,
    libraryIndex,
    reported,
    servicesFor,
  };
};
