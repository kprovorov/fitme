/**
 * A fetch-level stand-in for `apps/api`, the `fetch` of the Public API client
 * in every test file (`test-utils/setup.ts`). It answers like the `/v1` routes
 * over the fake Supabase backend's rows (`backend`), so a write through it
 * shows in the next Supabase read, and as the User `FAKE_USER_ID` when the
 * bearer is `FAKE_SESSION_TOKEN` (anything else is a 401). Point the app's
 * `getCurrentUserId` at `FAKE_USER_ID` so its Supabase reads see the same
 * User.
 *
 * So far: `PUT` (201 created, 200 replaced, converting to a new system) and
 * `PATCH /v1/profile`, `POST /v1/plans`, activating
 * (`POST /v1/plans/{id}/activate`) and deleting (`DELETE /v1/plans/{id}`) a
 * Plan, starting, finishing and logging a set of a Workout Session, adding,
 * removing (`DELETE /v1/workout-session-exercises/{id}`) and replacing
 * (`PUT /v1/workout-session-exercises/{id}`) an Exercise of one, and the
 * public `GET /v1/arnold/models` (answered whatever the bearer, like the
 * API's). Routes are named as templates (`Route`), each request keeping its
 * `path`. A route it doesn't implement answers 501 and fails the
 * test after it (`test-utils/after-each.ts`). `failNext` fails a route on
 * demand.
 */
import {
  arnoldModels,
  defaultArnoldModelId,
  experienceLevels,
  genders,
  goals,
  MAX_AGE,
  MAX_BODY_DECIMALS,
  MAX_BODY_HEIGHT,
  MAX_BODY_WEIGHT,
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
  MIN_AGE,
  MIN_FREQUENCY,
  measurementSystems,
  places,
} from "@fitme/core";
import type { PublicApiFetch } from "~/lib/api/client";
import { library } from "./fake-library";
import {
  backend,
  type ProfileRow,
  type SeedPlan,
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

const hasAtMostBodyDecimals = (value: number) => {
  const scaled = value * 10 ** MAX_BODY_DECIMALS;
  return Math.abs(scaled - Math.round(scaled)) < 1e-9;
};

const isBodyValue = (value: unknown, max: number) =>
  typeof value === "number" &&
  value > 0 &&
  value <= max &&
  hasAtMostBodyDecimals(value);

/** The first field `PATCH /v1/profile`'s bounds refuse, if any. */
const invalidProfileField = (changes: Partial<ProfileRow>) => {
  if (changes.age !== undefined && !isInteger(changes.age, MIN_AGE, MAX_AGE)) {
    return "age";
  }
  if (
    changes.gender !== undefined &&
    !(genders as readonly string[]).includes(changes.gender)
  ) {
    return "gender";
  }
  if (
    changes.height !== undefined &&
    !isBodyValue(changes.height, MAX_BODY_HEIGHT)
  ) {
    return "height";
  }
  if (
    changes.weight !== undefined &&
    !isBodyValue(changes.weight, MAX_BODY_WEIGHT)
  ) {
    return "weight";
  }
  return null;
};

/** The 400 for Profile fields out of `PATCH /v1/profile`'s bounds, if any. */
const profileFieldsError = (changes: Partial<ProfileRow>) => {
  const invalid = invalidProfileField(changes);
  if (invalid) {
    return error(400, "invalid_request", `${invalid}: out of bounds`);
  }
  const system = changes.measurement_system;
  if (
    system !== undefined &&
    !measurementSystems.includes(system as MeasurementSystem)
  ) {
    return error(400, "invalid_request", "measurement_system: Invalid option");
  }
  return null;
};

/** Applies `changes` to `profile`, converting to a new system first. */
const applyProfileChanges = (
  profile: ProfileRow,
  changes: Partial<ProfileRow>
) => {
  if (changes.measurement_system !== undefined) {
    convert(profile, changes.measurement_system as MeasurementSystem);
  }
  Object.assign(profile, changes);
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
  const invalid = profileFieldsError(changes);
  if (invalid) {
    return invalid;
  }
  const profile = backend.profile(FAKE_USER_ID);
  if (!profile) {
    return error(404, "profile_not_found", "Profile not found");
  }
  applyProfileChanges(profile, changes);
  return json(200, { data: profileBody(profile) });
};

/**
 * `PUT /v1/profile`: every field required, with the PATCH bounds; creates the
 * Profile (201) or replaces it as a PATCH with every field would (200).
 */
const putProfile = (body: unknown): Response => {
  if (
    !isObject(body) ||
    Object.keys(body).length !== PROFILE_FIELDS.size ||
    Object.keys(body).some((key) => !PROFILE_FIELDS.has(key))
  ) {
    return error(400, "invalid_request", "Invalid profile");
  }
  const whole = body as unknown as Omit<ProfileRow, "user_id">;
  const invalid = profileFieldsError(whole);
  if (invalid) {
    return invalid;
  }
  const existing = backend.profile(FAKE_USER_ID);
  if (existing) {
    applyProfileChanges(existing, whole);
    return json(200, { data: profileBody(existing) });
  }
  const created = { ...whole, user_id: FAKE_USER_ID };
  backend.profiles.push(created);
  return json(201, { data: profileBody(created) });
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
 * Checks every slug against the fake Library (`serveLibrary`, its
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
      "library_unavailable",
      "The Library is unavailable, try again"
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

/** The Plan becomes active, every other one of the User inactive. */
const activatePlan = (_body: unknown, planId: string): Response => {
  const plan = backend.plans.find(
    ({ deleted_at, id }) => id === planId && !deleted_at
  );
  if (!plan) {
    return error(404, "not_found", "Plan not found");
  }
  for (const other of backend.plans) {
    other.is_active = other === plan;
  }
  return json(200, {
    data: { ...backend.nestedPlan(plan), weight_unit: "kg" },
  });
};

/** A soft delete; a Plan already deleted answers 204 again. */
const deletePlan = (_body: unknown, planId: string): Response => {
  const plan = backend.plans.find(({ id }) => id === planId);
  if (!plan) {
    return error(404, "not_found", "Plan not found");
  }
  plan.deleted_at ??= "2026-10-24T12:00:00.000Z";
  plan.is_active = false;
  return new Response(null, { status: 204 });
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

/** Checks one slug against the fake Library, as `checkExerciseSlugs` does. */
const refuseUnknownSlug = async (slug: string) => {
  let missing: string[];
  try {
    ({ missing } = await library.current.lookup([slug]));
  } catch {
    return error(
      503,
      "library_unavailable",
      "The Library is unavailable, try again"
    );
  }
  return missing.length > 0
    ? error(400, "unknown_exercises", `Unknown exercise_slug(s): ${slug}`)
    : null;
};

/** The 409 of an edit to a finished Workout Session, or `null` while it's open. */
const refuseFinished = (session: SessionRow) =>
  session.finished_at === null
    ? null
    : error(
        409,
        "session_finished",
        `Workout Session ${session.id} is finished`
      );

/**
 * `addExerciseToWorkoutSession`: appends the Exercise, with no sets, after the
 * open Workout Session's last one (the highest `order` + 1).
 */
const addSessionExercise = async (
  body: unknown,
  sessionId: string
): Promise<Response> => {
  if (
    !isObject(body) ||
    typeof body.exercise_slug !== "string" ||
    unknownFields(body, ["exercise_slug"]).length > 0
  ) {
    return error(400, "invalid_request", "exercise_slug: Required");
  }
  const refusal = await refuseUnknownSlug(body.exercise_slug);
  if (refusal) {
    return refusal;
  }
  const session = backend.session(sessionId);
  if (!session) {
    return notFound("Workout Session");
  }
  const notOpen = refuseFinished(session);
  if (notOpen) {
    return notOpen;
  }
  const last = Math.max(
    0,
    ...backend.exercises
      .filter((other) => other.workout_session_id === sessionId)
      .map(({ order }) => order)
  );
  const exercise = {
    exercise_slug: body.exercise_slug,
    id: backend.id("added-exercise"),
    order: last + 1,
    workout_session_id: sessionId,
  };
  backend.exercises.push(exercise);
  const { workout_session_id: _session, ...shown } = exercise;
  return json(201, {
    data: { ...shown, sets: [], weight_unit: weightUnit() },
  });
};

/** Workout Sessions whose Plan Update has been applied. */
const appliedPlanUpdates = new Set<string>();

/** No Plan Update past this many Exercises, or sets of one, on either side. */
const MAX_PLAN_UPDATE_EXERCISES = 50;
const MAX_PLAN_UPDATE_SETS = 100;
const DEFAULT_REST = 90;

interface PlanUpdateSet {
  reps: number;
  rest: number;
  weight: number;
}

type PlanUpdateChange =
  | {
      exercise_slug: string;
      kind: "replace_exercise";
      replaced_exercise_slug: string;
      sets: PlanUpdateSet[];
    }
  | { exercise_slug: string; kind: "add_exercise"; sets: PlanUpdateSet[] }
  | { exercise_slug: string; kind: "remove_exercise" }
  | { exercise_slug: string; kind: "add_sets"; sets: PlanUpdateSet[] };

/** A seeded Workout as `backend.nestedPlan` shows it: orders, ids and set targets. */
type PlannedWorkout = ReturnType<typeof backend.nestedPlan>["workouts"][number];

/** A change, with the index of the Workout Exercise it applies to. */
type IndexedChange = PlanUpdateChange & { index: number };

const hasRepeat = (orders: number[]) => new Set(orders).size !== orders.length;

/**
 * `previewPlanUpdate`'s changes (`packages/services/src/plan-update.ts`),
 * matching the Workout Session's Exercises to the Workout's by `order`, each
 * with the Workout Exercise's index it applies to.
 */
const planUpdateChanges = (session: SessionRow, workout: PlannedWorkout) => {
  const sessionExercises = backend.exercises
    .filter((exercise) => exercise.workout_session_id === session.id)
    .map((exercise) => ({
      order: exercise.order,
      sets: backend.sets
        .filter((set) => set.workout_session_exercise_id === exercise.id)
        .sort((a, b) => a.order - b.order),
      slug: exercise.exercise_slug,
    }));
  const planExercises = workout.exercises.map((exercise) => ({
    order: exercise.order,
    rests: exercise.sets.map((set) => set.rest_recommended),
    slug: exercise.exercise_slug,
  }));
  if (
    hasRepeat(sessionExercises.map(({ order }) => order)) ||
    hasRepeat(planExercises.map(({ order }) => order)) ||
    sessionExercises.length > MAX_PLAN_UPDATE_EXERCISES ||
    planExercises.length > MAX_PLAN_UPDATE_EXERCISES ||
    sessionExercises.some(({ sets }) => sets.length > MAX_PLAN_UPDATE_SETS) ||
    planExercises.some(({ rests }) => rests.length > MAX_PLAN_UPDATE_SETS)
  ) {
    return [];
  }
  const orders = [
    ...new Set([...sessionExercises, ...planExercises].map((e) => e.order)),
  ].sort((a, b) => a - b);
  const logged = (sets: SetRow[]) =>
    sets.filter((set) => set.reps_completed !== null);
  const toSet = (set: SetRow, rest: number): PlanUpdateSet => ({
    reps: set.reps_completed as number,
    rest,
    weight: set.weight_completed ?? 0,
  });
  return orders.flatMap((order): IndexedChange[] => {
    const played = sessionExercises.find((e) => e.order === order);
    const planned = planExercises.find((e) => e.order === order);
    const index = planExercises.findIndex((e) => e.order === order);
    if (planned && !played) {
      return [{ exercise_slug: planned.slug, index, kind: "remove_exercise" }];
    }
    if (!played) {
      return [];
    }
    if (!planned) {
      const sets = logged(played.sets)
        .slice(0, MAX_SETS_PER_EXERCISE)
        .map((set) => toSet(set, DEFAULT_REST));
      return sets.length > 0
        ? [{ exercise_slug: played.slug, index, kind: "add_exercise", sets }]
        : [];
    }
    if (played.slug !== planned.slug) {
      const last = logged(played.sets).at(-1);
      if (!last) {
        return [];
      }
      const sets = played.sets
        .slice(0, MAX_SETS_PER_EXERCISE)
        .map((set, setIndex) =>
          toSet(
            set.reps_completed === null ? last : set,
            planned.rests[setIndex] ?? planned.rests.at(-1) ?? DEFAULT_REST
          )
        );
      return [
        {
          exercise_slug: played.slug,
          index,
          kind: "replace_exercise",
          replaced_exercise_slug: planned.slug,
          sets,
        },
      ];
    }
    const sets = logged(
      played.sets.filter(
        (set, setIndex) =>
          set.reps_recommended === null || setIndex + 1 > planned.rests.length
      )
    )
      .slice(0, Math.max(MAX_SETS_PER_EXERCISE - planned.rests.length, 0))
      .map((set) => toSet(set, planned.rests.at(-1) ?? DEFAULT_REST));
    return sets.length > 0
      ? [{ exercise_slug: played.slug, index, kind: "add_sets", sets }]
      : [];
  });
};

const planSet = ({ reps, rest, weight }: PlanUpdateSet): SeedPlanSet => ({
  reps_recommended: reps,
  rest_recommended: rest,
  weight_recommended: weight,
});

/**
 * Writes the changes to the seeded Workout in the service's order:
 * replacements and added sets, then removals (the rest renumbered, as an
 * Exercise's `order` is its position), then added Exercises appended.
 */
const applyPlanUpdateChanges = (
  workout: SeedPlan["workouts"][number],
  planned: PlannedWorkout,
  changes: IndexedChange[]
) => {
  const exercises = planned.exercises.map((exercise) => ({
    sets: exercise.sets.map(
      ({ reps_recommended, rest_recommended, weight_recommended }) => ({
        reps_recommended,
        rest_recommended,
        weight_recommended,
      })
    ),
    slug: exercise.exercise_slug,
  }));
  for (const change of changes) {
    const exercise = exercises[change.index];
    if (change.kind === "replace_exercise" && exercise) {
      exercise.slug = change.exercise_slug;
      exercise.sets = change.sets.map(planSet);
    } else if (change.kind === "add_sets" && exercise) {
      exercise.sets.push(...change.sets.map(planSet));
    }
  }
  const removed = new Set(
    changes.flatMap((change) =>
      change.kind === "remove_exercise" ? [change.index] : []
    )
  );
  workout.exercises = [
    ...exercises.filter((_, index) => !removed.has(index)),
    ...changes.flatMap((change) =>
      change.kind === "add_exercise"
        ? [{ sets: change.sets.map(planSet), slug: change.exercise_slug }]
        : []
    ),
  ];
};

/**
 * `previewPlanUpdate` / `applyPlanUpdate`: the Workout Session's changes to
 * its Workout (none while it's open, without a live Plan's Workout, or once
 * applied), applied to the seeded Plan with `apply`.
 */
const planUpdate =
  (apply: boolean) =>
  (_body: unknown, sessionId: string): Response => {
    const session = backend.session(sessionId);
    if (!session) {
      return notFound("Workout Session");
    }
    const found = session.workout_id ? findWorkout(session.workout_id) : null;
    if (!found || found.plan.deleted_at) {
      return json(200, {
        data: {
          changes: [],
          plan: null,
          weight_unit: weightUnit(),
          workout: null,
        },
      });
    }
    const { plan, workout } = found;
    const planned = backend
      .nestedPlan(plan)
      .workouts.find(({ id }) => id === workout.id);
    const changes =
      planned &&
      session.finished_at !== null &&
      !appliedPlanUpdates.has(session.id)
        ? planUpdateChanges(session, planned)
        : [];
    if (apply && planned && changes.length > 0) {
      applyPlanUpdateChanges(workout, planned, changes);
      appliedPlanUpdates.add(session.id);
    }
    return json(200, {
      data: {
        changes: changes.map(({ index: _index, ...change }) =>
          "sets" in change
            ? {
                ...change,
                sets: change.sets.map(({ reps, weight }) => ({
                  reps,
                  weight,
                })),
              }
            : change
        ),
        plan: { id: plan.id, name: plan.name },
        weight_unit: weightUnit(),
        workout: { id: workout.id, name: workout.name },
      },
    });
  };

/**
 * `removeExerciseFromWorkoutSession`: deletes the Exercise and its sets,
 * leaving the others' `order` (the gap stays); 204 whether or not it matched.
 */
const removeSessionExercise = (_body: unknown, exerciseId: string) => {
  const exercise = backend.exercises.find(({ id }) => id === exerciseId);
  const session = exercise && backend.session(exercise.workout_session_id);
  if (!session) {
    return new Response(null, { status: 204 });
  }
  const notOpen = refuseFinished(session);
  if (notOpen) {
    return notOpen;
  }
  backend.sets = backend.sets.filter(
    (set) => set.workout_session_exercise_id !== exerciseId
  );
  backend.exercises = backend.exercises.filter(({ id }) => id !== exerciseId);
  return new Response(null, { status: 204 });
};

/**
 * `replaceExerciseInWorkoutSession`: swaps the slug in place and zeroes every
 * set's targets, keeping what was logged.
 */
const replaceSessionExercise = async (
  body: unknown,
  exerciseId: string
): Promise<Response> => {
  if (
    !isObject(body) ||
    typeof body.exercise_slug !== "string" ||
    unknownFields(body, ["exercise_slug"]).length > 0
  ) {
    return error(400, "invalid_request", "exercise_slug: Required");
  }
  const refusal = await refuseUnknownSlug(body.exercise_slug);
  if (refusal) {
    return refusal;
  }
  const exercise = backend.exercises.find(({ id }) => id === exerciseId);
  const session = exercise && backend.session(exercise.workout_session_id);
  if (!(exercise && session)) {
    return notFound("Workout Session Exercise");
  }
  const notOpen = refuseFinished(session);
  if (notOpen) {
    return notOpen;
  }
  exercise.exercise_slug = body.exercise_slug;
  const sets = backend.sets
    .filter((set) => set.workout_session_exercise_id === exerciseId)
    .sort((a, b) => a.order - b.order);
  for (const set of sets) {
    Object.assign(set, { reps_recommended: 0, weight_recommended: 0 });
  }
  const { workout_session_id: _session, ...shown } = exercise;
  return json(200, {
    data: { ...shown, sets: sets.map(setBody), weight_unit: weightUnit() },
  });
};

/** `apps/api`'s answer, from the same list in `@fitme/core`. */
const listArnoldModels = () =>
  json(200, {
    data: {
      defaultId: defaultArnoldModelId,
      models: arnoldModels.map(({ description, id, label }) => ({
        description,
        id,
        label,
      })),
    },
  });

type Handler = (body: unknown, id: string) => Promise<Response> | Response;

/** Every route the fake answers, each path parameter as `(?<id>…)`. */
const ROUTES: Array<{
  handler: Handler;
  path: RegExp;
  /** Answered without a bearer, like the API's global routes. */
  isPublic?: boolean;
  route: Route;
}> = [
  {
    handler: listArnoldModels,
    isPublic: true,
    path: /^\/v1\/arnold\/models$/,
    route: "GET /v1/arnold/models",
  },
  {
    handler: patchProfile,
    path: /^\/v1\/profile$/,
    route: "PATCH /v1/profile",
  },
  {
    handler: putProfile,
    path: /^\/v1\/profile$/,
    route: "PUT /v1/profile",
  },
  {
    handler: createPlan,
    path: /^\/v1\/plans$/,
    route: "POST /v1/plans",
  },
  {
    handler: activatePlan,
    path: /^\/v1\/plans\/(?<id>[^/]+)\/activate$/,
    route: "POST /v1/plans/{id}/activate",
  },
  {
    handler: deletePlan,
    path: /^\/v1\/plans\/(?<id>[^/]+)$/,
    route: "DELETE /v1/plans/{id}",
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
    handler: addSessionExercise,
    path: /^\/v1\/workout-sessions\/(?<id>[^/]+)\/exercises$/,
    route: "POST /v1/workout-sessions/{id}/exercises",
  },
  {
    handler: planUpdate(false),
    path: /^\/v1\/workout-sessions\/(?<id>[^/]+)\/plan-update$/,
    route: "GET /v1/workout-sessions/{id}/plan-update",
  },
  {
    handler: planUpdate(true),
    path: /^\/v1\/workout-sessions\/(?<id>[^/]+)\/plan-update$/,
    route: "POST /v1/workout-sessions/{id}/plan-update",
  },
  {
    handler: removeSessionExercise,
    path: /^\/v1\/workout-session-exercises\/(?<id>[^/]+)$/,
    route: "DELETE /v1/workout-session-exercises/{id}",
  },
  {
    handler: replaceSessionExercise,
    path: /^\/v1\/workout-session-exercises\/(?<id>[^/]+)$/,
    route: "PUT /v1/workout-session-exercises/{id}",
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
        isPublic: candidate.isPublic === true,
        route: candidate.route,
      };
    }
  }
  return {
    handler: null,
    id: "",
    isPublic: false,
    route: `${method} ${path}` as const,
  };
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
    appliedPlanUpdates.clear();
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
    { handler, id, isPublic, route }: ReturnType<typeof match>,
    authorization: string | null,
    body: unknown
  ) {
    if (!handler) {
      this.unhandled.push(route);
      return error(501, "not_implemented", `Fake Public API: no ${route}`);
    }
    if (!isPublic && authorization !== `Bearer ${FAKE_SESSION_TOKEN}`) {
      return error(401, "unauthorized", "Unauthorized");
    }
    return handler(body, id);
  }
}

export const fakePublicApi = new FakePublicApi();
