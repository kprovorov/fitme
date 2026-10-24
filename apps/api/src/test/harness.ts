import type { ExerciseSummary } from "@fitme/exercise-library";
import { createFakeExerciseLibrary } from "@fitme/exercise-library/fake";
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

/** An Exercise the fake Exercise Library knows, by slug. */
export const libraryExercise = (slug: string): ExerciseSummary => ({
  muscle_groups: ["quadriceps"],
  name: slug,
  slug,
  thumbnail_url: `https://media.example/${slug}.png`,
  video_url: `https://media.example/${slug}.mp4`,
});

/** The Exercises the test app's Exercise Library knows by default. */
export const KNOWN_SLUGS = ["barbell-back-squat", "barbell-deadlift"];

/**
 * The app over fake services and a fake Exercise Library knowing
 * `KNOWN_SLUGS` (`library.failWith` for an outage), trusting `clerk`, with a
 * recording reporter and Sentry user. `servicesFor` records the User id each facade was built for.
 */
export const testApp = (
  options: {
    /** Explicitly `undefined` for an API without CLERK_JWT_KEY. */
    clerkJwtKey?: string;
    /** Counts requests; by default one no test reaches (in memory, unlimited in practice). */
    rateLimiter?: RateLimiter;
    /** `null` for an API without the Exercise Library configured. */
    exerciseLibrary?: null;
    services?: UserServices | null;
  } = {}
) => {
  const library = createFakeExerciseLibrary(KNOWN_SLUGS.map(libraryExercise));
  const clerkJwtKey =
    "clerkJwtKey" in options ? options.clerkJwtKey : clerk.jwtKey;
  const services =
    options.services === undefined ? fakeServices({}) : options.services;
  const reported: unknown[] = [];
  const identified: string[] = [];
  const servicesFor: string[] = [];
  const deps: AppDeps = {
    clerkJwtKey,
    createExerciseLibrary: () =>
      options.exerciseLibrary === null ? null : library,
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
