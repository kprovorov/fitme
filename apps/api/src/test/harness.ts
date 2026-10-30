import type { MuscleGroup } from "@fitme/core/models";
import type { Cover, ExerciseSummary } from "@fitme/library-sdk";
import { createFakeLibrary } from "@fitme/library-sdk/fake";
import { memoryRateLimiter } from "@fitme/rate-limit";
import { type AppDeps, createApp } from "../create-app.js";
import type { RateLimiter } from "../rate-limit.js";
import type { UserServices } from "../services.js";
import { clerkInstance, clerkToken } from "./clerk.js";

/** The Clerk instance the test app trusts. */
export const clerk = clerkInstance();

/** `Authorization: Bearer` with a session token for `userId` from the trusted instance. */
export const signedInAs = (
  userId: string,
  claims: Record<string, unknown> = {}
) => ({
  authorization: `Bearer ${clerkToken(clerk.privateKey, { sub: userId, ...claims })}`,
});

/**
 * Services that answer only what a test fakes: calling any other method fails
 * the request (and so the test) with a reported 500.
 */
export const fakeServices = (faked: Partial<UserServices>): UserServices =>
  new Proxy(faked as UserServices, {
    get: (target, method: string) =>
      target[method as keyof UserServices] ??
      (() => {
        throw new Error(`Unfaked service method: ${method}`);
      }),
  });

/** An Exercise the fake Library knows, by slug (quadriceps unless told otherwise). */
export const libraryExercise = (
  slug: string,
  muscleGroups: MuscleGroup[] = ["quadriceps"]
): ExerciseSummary => ({
  muscle_groups: muscleGroups,
  name: slug,
  slug,
  thumbnail_url: `https://media.example/${slug}.png`,
  video_url: `https://media.example/${slug}.mp4`,
});

/** A Cover the fake Library has, by id, tagged with `muscleGroups`. */
export const libraryCover = (
  id: string,
  muscleGroups: MuscleGroup[]
): Cover => ({
  id,
  image_url: `https://media.example/covers/${id}.jpg`,
  muscle_groups: muscleGroups,
});

/** The Exercises the test app's Library knows by default. */
export const KNOWN_SLUGS = ["barbell-back-squat", "barbell-deadlift"];

/**
 * The app over fake services and a fake Library knowing
 * `KNOWN_SLUGS` and no Covers unless given (`library.failWith` for an outage), trusting `clerk`, with a
 * recording reporter and Sentry user. `servicesFor` records the User id each facade was built for.
 */
export const testApp = (
  options: {
    /** Explicitly `undefined` for an API without CLERK_JWT_KEY. */
    clerkJwtKey?: string;
    /** The Library's Covers; none by default. */
    covers?: Cover[];
    /** The Library's Exercises; `KNOWN_SLUGS` by default. */
    exercises?: ExerciseSummary[];
    /** Counts requests; by default one no test reaches (in memory, unlimited in practice). */
    rateLimiter?: RateLimiter;
    /** `null` for an API without the Library configured. */
    library?: null;
    services?: UserServices | null;
  } = {}
) => {
  const library = createFakeLibrary(
    options.exercises ?? KNOWN_SLUGS.map((slug) => libraryExercise(slug)),
    { covers: options.covers }
  );
  const clerkJwtKey =
    "clerkJwtKey" in options ? options.clerkJwtKey : clerk.jwtKey;
  const services =
    options.services === undefined ? fakeServices({}) : options.services;
  const reported: unknown[] = [];
  const identified: string[] = [];
  const servicesFor: string[] = [];
  const deps: AppDeps = {
    clerkJwtKey,
    createLibrary: () => (options.library === null ? null : library),
    createServices: (userId) => {
      servicesFor.push(userId);
      return services;
    },
    identifyUser: (userId) => {
      identified.push(userId);
    },
    rateLimiter:
      options.rateLimiter ??
      memoryRateLimiter({ limit: Number.MAX_SAFE_INTEGER, windowMs: 60_000 }),
    reportError: (error) => {
      reported.push(error);
      return Promise.resolve();
    },
  };
  return { app: createApp(deps), identified, library, reported, servicesFor };
};
