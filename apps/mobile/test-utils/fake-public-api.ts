/**
 * A fetch-level stand-in for `apps/api`, the `fetch` of the Public API client
 * in every test file (`test-utils/setup.ts`). It answers like the `/v1` routes
 * over the fake Supabase backend's rows (`backend`), so a write through it
 * shows in the next Supabase read, and as the User `FAKE_USER_ID` when the
 * bearer is `FAKE_SESSION_TOKEN` (anything else is a 401). Point the app's
 * `getCurrentUserId` at `FAKE_USER_ID` so its Supabase reads see the same
 * User.
 *
 * So far: `PATCH /v1/profile`, `POST /v1/plans`, and starting, finishing and logging a set of
 * a Workout Session. Routes are named as templates (`Route`), each request
 * keeping its `path`. A route it doesn't implement answers 501 and fails the
 * test after it (`test-utils/after-each.ts`). `failNext` fails a route on
 * demand.
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
  type SessionRow,
  type SetRow,
} from "./fake-workout-backend";

export const FAKE_PUBLIC_API_URL = "https://api.test";
export const FAKE_SESSION_TOKEN = "test-session-token";
export const FAKE_USER_ID = "user_test";

/**
 * A route as `"<METHOD> <path>"`, its path parameters as `{id}`, e.g.
 * `"PATCH /v1/profile"` or `"POST /v1/workout-sessions/{id}/finish"`.
 */
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
  /** The path as sent, e.g. `/v1/workout-sessions/s1/finish`. */
  path: string;
  /** The route it matched, path parameters as `{id}`. */
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

const FINISHED_AT = "2026-10-08T11:00:00.000Z";
const LOGGED_AT = "2026-10-08T10:45:00.000Z";
const STARTED_AT = "2026-10-08T10:00:00.000Z";

const notFound = (what: string) => error(404, "not_found", `${what} not found`);

const weightUnit = () =>
  unitsOf(backend.profile(FAKE_USER_ID)?.measurement_system ?? "metric").weight;

const setBody = ({ workout_session_exercise_id: _exercise, ...set }: SetRow) =>
  set;

/** A Workout Session in full, as `GET /v1/workout-sessions/{id}` shows it. */
const sessionBody = (session: SessionRow) => {
  const plan = backend.plans.find(({ id }) => id === session.plan_id);
  return {
    exercises: backend.exercises
      .filter((exercise) => exercise.workout_session_id === session.id)
      .sort((a, b) => a.order - b.order)
      .map(({ exercise_slug, id, order }) => ({
        exercise_slug,
        id,
        order,
        sets: backend.sets
          .filter((set) => set.workout_session_exercise_id === id)
          .sort((a, b) => a.order - b.order)
          .map(setBody),
      })),
    finished_at: session.finished_at,
    id: session.id,
    plan: session.plan_id
      ? { id: session.plan_id, name: plan?.name ?? null }
      : null,
    started_at: session.started_at,
    status: session.finished_at === null ? "in_progress" : "finished",
    weight_unit: weightUnit(),
    workout: session.workout_id
      ? { id: session.workout_id, name: session.workoutName }
      : null,
  };
};

const findWorkout = (workoutId: string) => {
  for (const plan of backend.plans) {
    const workout = plan.workouts.find(({ id }) => id === workoutId);
    if (workout) {
      return { plan, workout };
    }
  }
  return null;
};

/**
 * `startWorkoutSession`: resumes the Workout's open Workout Session (200), or
 * starts one copying the Workout's Exercises and sets (201), as
 * `backend.nestedPlan` shows them.
 */
const startSession = (body: unknown): Response => {
  const workoutId = (body as { workout_id?: unknown } | undefined)?.workout_id;
  if (
    typeof workoutId !== "string" ||
    Object.keys(body as object).length !== 1
  ) {
    return error(400, "invalid_request", "workout_id: Required");
  }
  const open = backend.sessions.find(
    (other) => other.workout_id === workoutId && other.finished_at === null
  );
  if (open) {
    return json(200, { data: sessionBody(open) });
  }
  const found = findWorkout(workoutId);
  if (!found) {
    return notFound("Workout");
  }
  const { plan, workout } = found;
  const session: SessionRow = {
    finished_at: null,
    id: backend.id("started-session"),
    plan_id: plan.id,
    started_at: STARTED_AT,
    workout_id: workout.id,
    workoutName: workout.name,
  };
  backend.sessions.push(session);
  const planned = backend
    .nestedPlan(plan)
    .workouts.find(({ id }) => id === workout.id);
  for (const exercise of planned?.exercises ?? []) {
    const exerciseId = backend.id("started-exercise");
    backend.exercises.push({
      exercise_slug: exercise.exercise_slug,
      id: exerciseId,
      order: exercise.order,
      workout_session_id: session.id,
    });
    for (const set of exercise.sets) {
      backend.sets.push({
        id: backend.id("started-set"),
        logged_at: null,
        order: set.order,
        reps_completed: null,
        reps_recommended: set.reps_recommended,
        rest_recommended: set.rest_recommended,
        weight_completed: null,
        weight_recommended: set.weight_recommended,
        workout_session_exercise_id: exerciseId,
      });
    }
  }
  return json(201, { data: sessionBody(session) });
};

/**
 * `finishWorkoutSession`: finishes the Workout Session and moves its Workout
 * to the end of its Plan's rotation; a repeat changes nothing.
 */
const finishSession = (_body: unknown, sessionId: string): Response => {
  const session = backend.session(sessionId);
  if (!session) {
    return notFound("Workout Session");
  }
  if (session.finished_at !== null) {
    return json(200, { already_finished: true, data: sessionBody(session) });
  }
  session.finished_at = FINISHED_AT;
  const found = session.workout_id ? findWorkout(session.workout_id) : null;
  if (found) {
    const { plan, workout } = found;
    plan.workouts = [
      ...plan.workouts.filter((other) => other !== workout),
      workout,
    ];
  }
  return json(200, { already_finished: false, data: sessionBody(session) });
};

/** `logSet`: only a set of an open Workout Session, with the server's time. */
const logSet = (body: unknown, setId: string): Response => {
  const { reps_completed, weight_completed, ...rest } = (body ?? {}) as {
    reps_completed?: unknown;
    weight_completed?: unknown;
  };
  if (
    !Number.isInteger(reps_completed) ||
    typeof weight_completed !== "number" ||
    Object.keys(rest).length > 0
  ) {
    return error(400, "invalid_request", "Invalid set");
  }
  const set = backend.sets.find(({ id }) => id === setId);
  const exercise = backend.exercises.find(
    ({ id }) => id === set?.workout_session_exercise_id
  );
  const session = exercise && backend.session(exercise.workout_session_id);
  if (!(set && session)) {
    return notFound("Workout Session set");
  }
  if (session.finished_at !== null) {
    return error(
      409,
      "session_finished",
      `Workout Session ${session.id} is finished`
    );
  }
  Object.assign(set, {
    logged_at: LOGGED_AT,
    reps_completed,
    weight_completed,
  });
  return json(200, { data: { ...setBody(set), weight_unit: weightUnit() } });
};

type Handler = (body: unknown, id: string) => Promise<Response> | Response;

/** Every route the fake answers, each path parameter as `(?<id>…)`. */
const ROUTES: Array<{ handler: Handler; path: RegExp; route: Route }> = [
  {
    handler: patchProfile,
    path: /^\/v1\/profile$/,
    route: "PATCH /v1/profile",
  },
  {
    handler: createPlan,
    path: /^\/v1\/plans$/,
    route: "POST /v1/plans",
  },
  {
    handler: startSession,
    path: /^\/v1\/workout-sessions$/,
    route: "POST /v1/workout-sessions",
  },
  {
    handler: finishSession,
    path: /^\/v1\/workout-sessions\/(?<id>[^/]+)\/finish$/,
    route: "POST /v1/workout-sessions/{id}/finish",
  },
  {
    handler: logSet,
    path: /^\/v1\/workout-session-sets\/(?<id>[^/]+)$/,
    route: "PATCH /v1/workout-session-sets/{id}",
  },
];

/** The route a request matches, or the request itself when none does. */
const match = (method: string, path: string) => {
  for (const candidate of ROUTES) {
    const params = path.match(candidate.path);
    if (params && candidate.route.startsWith(`${method} `)) {
      return {
        handler: candidate.handler,
        id: decodeURIComponent(params.groups?.id ?? ""),
        route: candidate.route,
      };
    }
  }
  return { handler: null, id: "", route: `${method} ${path}` as const };
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
    const matched = match(init.method ?? "GET", pathname);
    const { route } = matched;
    const authorization = new Headers(init.headers).get("Authorization");
    const body =
      typeof init.body === "string" && init.body !== ""
        ? (JSON.parse(init.body) as unknown)
        : undefined;
    this.requests.push({ authorization, body, path: pathname, route });

    // Answers on a later macrotask, like a network response.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await this.pauses.find((pause) => pause.route === route)?.resumed;

    const queued = this.failures.find((failure) => failure.route === route);
    if (queued) {
      this.failures = this.failures.filter((other) => other !== queued);
      const { failure } = queued;
      if (failure === "lost") {
        await this.answer(matched, authorization, body);
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

    return this.answer(matched, authorization, body);
  };

  private answer(
    { handler, id, route }: ReturnType<typeof match>,
    authorization: string | null,
    body: unknown
  ) {
    if (!handler) {
      this.unhandled.push(route);
      return error(501, "not_implemented", `Fake Public API: no ${route}`);
    }
    if (authorization !== `Bearer ${FAKE_SESSION_TOKEN}`) {
      return error(401, "unauthorized", "Unauthorized");
    }
    return handler(body, id);
  }
}

export const fakePublicApi = new FakePublicApi();
