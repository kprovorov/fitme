/**
 * A fetch-level stand-in for `apps/api`, the `fetch` of the Public API client
 * in every test file (`test-utils/setup.ts`). It answers like the `/v1` routes
 * over the fake Supabase backend's rows (`backend`), so a write through it
 * shows in the next Supabase read, and as the User `FAKE_USER_ID` when the
 * bearer is `FAKE_SESSION_TOKEN` (anything else is a 401). Point the app's
 * `getCurrentUserId` at `FAKE_USER_ID` so its Supabase reads see the same
 * User.
 *
 * A route it doesn't implement answers 501 and fails the test after it
 * (`test-utils/after-each.ts`). `failNext` fails a route on demand.
 */
import {
  experienceLevels,
  goals,
  MAX_EXERCISES_PER_WORKOUT,
  MAX_FREQUENCY,
  MAX_PLAN_NAME_LENGTH,
  MAX_PLAN_TEXT_LENGTH,
  MAX_REPS,
  MAX_REST_SECONDS,
  MAX_SETS_PER_EXERCISE,
  MAX_WEIGHT,
  MAX_WORKOUT_DURATION_MINUTES,
  MAX_WORKOUTS_PER_PLAN,
  type MeasurementSystem,
  MIN_FREQUENCY,
  measurementSystems,
  places,
} from "@fitme/core";
import type { PublicApiFetch } from "~/lib/api/client";
import { library } from "./fake-exercise-library";
import {
  backend,
  type ProfileRow,
  type SeedPlanSet,
} from "./fake-workout-backend";

export const FAKE_PUBLIC_API_URL = "https://api.test";
export const FAKE_SESSION_TOKEN = "test-session-token";
export const FAKE_USER_ID = "user_test";

/** A route as `"<METHOD> <path>"`, e.g. `"PATCH /v1/profile"`. */
export type Route =
  `${"DELETE" | "GET" | "PATCH" | "POST" | "PUT"} /v1/${string}`;

export type Failure =
  /** The connection fails before any answer. */
  | "network"
  /** The request is applied, then the connection fails before the answer. */
  | "lost"
  /** An error answer; a 429 gets `Retry-After: retryAfterSeconds` (30). */
  | { code?: string; retryAfterSeconds?: number; status: number };

export interface ReceivedRequest {
  authorization: string | null;
  body: unknown;
  route: string;
}

// `updateProfile`'s factors and rounding (`packages/services/src/profile.ts`,
// the same as the `convert_measurement_system` RPC's).
const HEIGHT_FACTOR = 0.393_701;
const WEIGHT_FACTOR = 2.204_62;
const PROFILE_FIELDS = new Set([
  "age",
  "gender",
  "height",
  "measurement_system",
  "weight",
]);

const round2 = (value: number) => Math.round(value * 100) / 100;

const isImperial = (system: string) => system !== "metric";

const unitsOf = (system: string) =>
  isImperial(system)
    ? { height: "in", weight: "lbs" }
    : { height: "cm", weight: "kg" };

const json = (status: number, body: unknown, headers: HeadersInit = {}) =>
  new Response(body === null ? null : JSON.stringify(body), {
    headers: { "Content-Type": "application/json", ...headers },
    status,
  });

const error = (
  status: number,
  code: string,
  message: string,
  headers?: HeadersInit
) => json(status, { error: { code, message } }, headers);

const profileBody = (profile: ProfileRow) => {
  const { user_id: _userId, ...fields } = profile;
  return { ...fields, units: unitsOf(profile.measurement_system) };
};

/** Every stored height and weight of the User, as the API converts them. */
const convert = (profile: ProfileRow, to: MeasurementSystem) => {
  if (isImperial(profile.measurement_system) === isImperial(to)) {
    return;
  }
  const toImperial = isImperial(to);
  const height = toImperial ? HEIGHT_FACTOR : 1 / HEIGHT_FACTOR;
  const weight = toImperial ? WEIGHT_FACTOR : 1 / WEIGHT_FACTOR;
  profile.height = round2(profile.height * height);
  profile.weight = round2(profile.weight * weight);
  for (const set of backend.sets) {
    if (set.weight_completed !== null) {
      set.weight_completed = round2(set.weight_completed * weight);
    }
    if (set.weight_recommended !== null) {
      set.weight_recommended = round2(set.weight_recommended * weight);
    }
  }
};

const patchProfile = (body: unknown): Response => {
  if (
    typeof body !== "object" ||
    body === null ||
    Object.keys(body).length === 0 ||
    Object.keys(body).some((key) => !PROFILE_FIELDS.has(key))
  ) {
    return error(400, "invalid_request", "Invalid profile changes");
  }
  const changes = body as Partial<ProfileRow>;
  const system = changes.measurement_system;
  if (
    system !== undefined &&
    !measurementSystems.includes(system as MeasurementSystem)
  ) {
    return error(400, "invalid_request", "measurement_system: Invalid option");
  }
  const profile = backend.profile(FAKE_USER_ID);
  if (!profile) {
    return error(404, "profile_not_found", "Profile not found");
  }
  if (system !== undefined) {
    convert(profile, system as MeasurementSystem);
  }
  Object.assign(profile, changes);
  return json(200, { data: profileBody(profile) });
};

type Body = Record<string, unknown>;

const isObject = (value: unknown): value is Body =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isInteger = (value: unknown, min: number, max: number) =>
  Number.isInteger(value) &&
  (value as number) >= min &&
  (value as number) <= max;

const isText = (value: unknown, max: number, min = 0) =>
  typeof value === "string" &&
  value.trim().length >= min &&
  value.length <= max;

/** The fields of `body` the route's strict schema doesn't know. */
const unknownFields = (body: Body, fields: readonly string[]) =>
  Object.keys(body).filter((key) => !fields.includes(key));

const isList = (value: unknown, max: number): value is unknown[] =>
  Array.isArray(value) && value.length >= 1 && value.length <= max;

const isPlanSet = (set: unknown): set is SeedPlanSet =>
  isObject(set) &&
  unknownFields(set, [
    "reps_recommended",
    "rest_recommended",
    "weight_recommended",
  ]).length === 0 &&
  isInteger(set.reps_recommended, 1, MAX_REPS) &&
  isInteger(set.rest_recommended, 0, MAX_REST_SECONDS) &&
  typeof set.weight_recommended === "number" &&
  set.weight_recommended >= 0 &&
  set.weight_recommended <= MAX_WEIGHT;

interface NewPlanExercise {
  exercise_slug: string;
  sets: SeedPlanSet[];
}

const isPlanExercise = (exercise: unknown): exercise is NewPlanExercise =>
  isObject(exercise) &&
  unknownFields(exercise, ["exercise_slug", "sets"]).length === 0 &&
  typeof exercise.exercise_slug === "string" &&
  exercise.exercise_slug !== "" &&
  isList(exercise.sets, MAX_SETS_PER_EXERCISE) &&
  exercise.sets.every(isPlanSet);

interface NewPlanWorkout {
  description: string;
  exercises: NewPlanExercise[];
  name: string;
}

const isPlanWorkout = (workout: unknown): workout is NewPlanWorkout =>
  isObject(workout) &&
  unknownFields(workout, ["description", "exercises", "name"]).length === 0 &&
  isText(workout.description, MAX_PLAN_TEXT_LENGTH) &&
  isText(workout.name, MAX_PLAN_NAME_LENGTH, 1) &&
  isList(workout.exercises, MAX_EXERCISES_PER_WORKOUT) &&
  workout.exercises.every(isPlanExercise);

const PLAN_FIELDS = [
  "activate",
  "description",
  "experience_level",
  "frequency",
  "goal",
  "name",
  "note",
  "place",
  "workout_duration",
  "workouts",
] as const;

/** `POST /v1/plans`'s schema (`apps/api/src/routes/plans.ts`), the bounds included. */
const isNewPlan = (
  body: unknown
): body is Body & {
  activate?: boolean;
  name: string;
  workouts: NewPlanWorkout[];
} =>
  isObject(body) &&
  unknownFields(body, PLAN_FIELDS).length === 0 &&
  (body.activate === undefined || typeof body.activate === "boolean") &&
  isText(body.description, MAX_PLAN_TEXT_LENGTH) &&
  (experienceLevels as readonly unknown[]).includes(body.experience_level) &&
  isInteger(body.frequency, MIN_FREQUENCY, MAX_FREQUENCY) &&
  (goals as readonly unknown[]).includes(body.goal) &&
  isText(body.name, MAX_PLAN_NAME_LENGTH, 1) &&
  (body.note === undefined ||
    body.note === null ||
    isText(body.note, MAX_PLAN_TEXT_LENGTH)) &&
  (places as readonly unknown[]).includes(body.place) &&
  isInteger(body.workout_duration, 1, MAX_WORKOUT_DURATION_MINUTES) &&
  isList(body.workouts, MAX_WORKOUTS_PER_PLAN) &&
  body.workouts.every(isPlanWorkout);

/**
 * Checks every slug against the fake Exercise Library (`serveLibrary`, its
 * `failWith` for an outage), then saves the Plan into the fake backend's
 * rows, active unless `activate: false`.
 */
const createPlan = async (body: unknown): Promise<Response> => {
  if (!isNewPlan(body)) {
    return error(400, "invalid_request", "Invalid plan");
  }
  const slugs = body.workouts.flatMap((workout) =>
    workout.exercises.map((exercise) => exercise.exercise_slug)
  );
  let missing: string[];
  try {
    ({ missing } = await library.current.lookup(slugs));
  } catch {
    return error(
      503,
      "exercise_library_unavailable",
      "The Exercise Library is unavailable, try again"
    );
  }
  if (missing.length > 0) {
    return error(
      400,
      "unknown_exercises",
      `Unknown Exercises: ${missing.join(", ")}`
    );
  }
  const activate = body.activate ?? true;
  if (activate) {
    for (const plan of backend.plans) {
      plan.is_active = false;
    }
  }
  const plan = {
    id: backend.id("plan"),
    is_active: activate,
    name: body.name,
    workouts: body.workouts.map((workout) => ({
      exercises: workout.exercises.map((exercise) => ({
        sets: exercise.sets,
        slug: exercise.exercise_slug,
      })),
      id: backend.id("workout"),
      name: workout.name,
    })),
  };
  backend.seedPlan(plan);
  return json(201, {
    data: { ...backend.nestedPlan(plan), weight_unit: "kg" },
  });
};

const ROUTES = new Set(["PATCH /v1/profile", "POST /v1/plans"]);

const isImplemented = (route: string) => ROUTES.has(route);

const answer = (route: string, body: unknown): Promise<Response> | Response => {
  switch (route) {
    case "PATCH /v1/profile":
      return patchProfile(body);
    case "POST /v1/plans":
      return createPlan(body);
    default:
      throw new Error(`Fake Public API: no handler for ${route}`);
  }
};

class FakePublicApi {
  /** The client's base URL; `""` makes the app see `EXPO_PUBLIC_API_URL` unset. */
  baseUrl = FAKE_PUBLIC_API_URL;
  /** Every request received, in order. */
  requests: ReceivedRequest[] = [];
  /** Routes the fake doesn't implement; a test bug, checked after each test. */
  unhandled: string[] = [];
  private failures: Array<{ failure: Failure; route: string }> = [];
  private pauses: Array<{ resumed: Promise<void>; route: string }> = [];

  reset() {
    this.baseUrl = FAKE_PUBLIC_API_URL;
    this.requests = [];
    this.unhandled = [];
    this.failures = [];
    this.pauses = [];
  }

  /**
   * Holds requests to `route` unanswered until the returned function is
   * called, like a slow connection.
   */
  pause(route: Route) {
    let resume!: () => void;
    const resumed = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const pause = { resumed, route };
    this.pauses.push(pause);
    return () => {
      this.pauses = this.pauses.filter((other) => other !== pause);
      resume();
    };
  }

  /** Makes the next request to `route` fail. */
  failNext(route: Route, failure: Failure) {
    this.failures.push({ failure, route });
  }

  count(route: Route) {
    return this.requests.filter((request) => request.route === route).length;
  }

  fetch: PublicApiFetch = async (url, init) => {
    const { pathname } = new URL(url);
    const route = `${init.method ?? "GET"} ${pathname}`;
    const authorization = new Headers(init.headers).get("Authorization");
    const body =
      typeof init.body === "string" && init.body !== ""
        ? (JSON.parse(init.body) as unknown)
        : undefined;
    this.requests.push({ authorization, body, route });

    // Answers on a later macrotask, like a network response.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await this.pauses.find((pause) => pause.route === route)?.resumed;

    const queued = this.failures.find((failure) => failure.route === route);
    if (queued) {
      this.failures = this.failures.filter((other) => other !== queued);
      const { failure } = queued;
      if (failure === "lost") {
        await this.answer(route, authorization, body);
        throw new TypeError("Network request failed");
      }
      if (failure === "network") {
        throw new TypeError("Network request failed");
      }
      const retryAfterSeconds = failure.retryAfterSeconds ?? 30;
      return failure.status === 429
        ? error(429, failure.code ?? "rate_limited", "Too many requests", {
            "Retry-After": String(retryAfterSeconds),
          })
        : error(
            failure.status,
            failure.code ?? "internal_error",
            "Something went wrong"
          );
    }

    return this.answer(route, authorization, body);
  };

  private answer(route: string, authorization: string | null, body: unknown) {
    if (!isImplemented(route)) {
      this.unhandled.push(route);
      return error(501, "not_implemented", `Fake Public API: no ${route}`);
    }
    if (authorization !== `Bearer ${FAKE_SESSION_TOKEN}`) {
      return error(401, "unauthorized", "Unauthorized");
    }
    return answer(route, body);
  }
}

export const fakePublicApi = new FakePublicApi();
