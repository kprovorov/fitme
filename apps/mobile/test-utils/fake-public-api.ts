/**
 * A fetch-level stand-in for `apps/api`, the `fetch` of the Public API client
 * in every test file (`test-utils/setup.ts`). It answers like the `/v1` routes
 * over its own in-memory rows (`backend`, below), so a write through it shows
 * in the next read, and as the User `FAKE_USER_ID` when the bearer is
 * `FAKE_SESSION_TOKEN` (anything else is a 401); seed that User's rows
 * (`backend.seedProfile(FAKE_USER_ID)`, a Plan's `user_id`) for it.
 *
 * So far: reading (`GET`, `{ data: null }` without one), `PUT` (201 created,
 * 200 replaced, converting to a new system) and `PATCH /v1/profile`, listing
 * (`GET /v1/plans`), reading the active Plan (`GET /v1/plans/active`,
 * `{ data: null }` without one) and a Plan (`GET /v1/plans/{id}`), creating (`POST /v1/plans`), activating
 * (`POST /v1/plans/{id}/activate`) and deleting (`DELETE /v1/plans/{id}`) a
 * Plan, the seeded Weekly goal changes (`GET /v1/weekly-goals`), listing
 * (`GET /v1/workout-sessions`, the open Workout Session's
 * `status=in_progress&limit=1` included), reading
 * (`GET /v1/workout-sessions/{id}`, 404 for another User's), starting,
 * finishing and
 * logging a set of a Workout Session, an Exercise's history
 * (`GET /v1/workout-session-exercises`), adding,
 * removing (`DELETE /v1/workout-session-exercises/{id}`) and replacing
 * (`PUT /v1/workout-session-exercises/{id}`) an Exercise of one, and the
 * public `GET /v1/arnold/models` (answered whatever the bearer, like the
 * API's). Routes are named as templates (`Route`), each request keeping its
 * `path`. A route it doesn't implement answers 501 and fails the
 * test after it (`test-utils/after-each.ts`). `failNext` fails a route on
 * demand, `pause` holds it, and both (and `count`) can narrow to requests
 * carrying given query parameters.
 */

import type { PublicApiFetch } from "@fitme/api-client";
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
  MIN_AGE,
  MIN_FREQUENCY,
  measurementSystems,
  personalRecordFor,
  places,
  recordResult,
} from "@fitme/core";
import type {
  ExperienceLevel,
  Goal,
  MeasurementSystem,
  Place,
} from "@fitme/core";
import { z } from "zod";

import { library, libraryExercise } from "./fake-library";

/*
 * The in-memory rows every route answers over (`backend`), and their seeding
 * helpers: a write through one route shows in the next read of another.
 */

export interface SessionRow {
  finished_at: string | null;
  id: string;
  plan_id: string | null;
  started_at: string;
  /**
   * Its owner's Clerk id; the fake Public API's User (`FAKE_USER_ID`) unless
   * given, so another id is another User's Workout Session, which the API
   * never shows.
   */
  user_id?: string;
  workout_id: string | null;
  workoutName: string;
}

export interface ProfileRow {
  age: number;
  gender: string;
  height: number;
  measurement_system: string;
  user_id: string;
  weight: number;
}

/** A Personal record a finished Workout Session earned, weight in the Profile's unit. */
export interface PersonalRecordRow {
  exercise_slug: string;
  kind: "reps" | "weight";
  reps: number;
  weight: number;
  workout_session_id: string;
}

interface ExerciseRow {
  exercise_slug: string;
  id: string;
  order: number;
  workout_session_id: string;
}

export interface SetRow {
  id: string;
  logged_at: string | null;
  order: number;
  reps_completed: number | null;
  reps_recommended: number | null;
  rest_recommended: number | null;
  weight_completed: number | null;
  weight_recommended: number | null;
  workout_session_exercise_id: string;
}

/**
 * Sets of an exercise, as `reps_completed` values (`null` = untracked). The
 * Exercise is stored by slug: `slug`, or one made from `name` ("Bench Press"
 * → `bench-press`), which `libraryExerciseNamed` serves under that name.
 */
export interface SeedExercise {
  name: string;
  sets: (number | null)[];
  slug?: string;
}

/** A Workout Exercise set's targets. */
export interface SeedPlanSet {
  /** Its id; `<workout>-e<n>-s<n>` from its position unless given. */
  id?: string;
  reps_recommended: number;
  rest_recommended: number;
  weight_recommended: number;
}

export interface SeedPlan {
  /** When it was soft-deleted; `null` (the default) while it's live. */
  deleted_at?: string | null;
  /** Its description; `About <name>` unless given, `null` for none. */
  description?: string | null;
  /**
   * Its experience level; `intermediate` unless given, `null` for a Plan
   * that leaves it unset (ADR 0017).
   */
  experience_level?: ExperienceLevel | null;
  /** Its Workouts a week; 3 unless given. */
  frequency?: number;
  /** Its goal; `strength-performance` unless given, `null` for unset. */
  goal?: Goal | null;
  id: string;
  /** Whether it's the User's active Plan; `false` unless given. */
  is_active?: boolean;
  name: string;
  /** Where it's trained; `gym` unless given, `null` for unset. */
  place?: Place | null;
  /**
   * Its owner's Clerk id; the fake Public API's User (`FAKE_USER_ID`) unless
   * given, so another id is another User's Plan, which the API never shows.
   */
  user_id?: string;
  /** Its Workout duration in minutes; 60 unless given, `null` for unset. */
  workout_duration?: number | null;
  workouts: {
    /** Its Library Cover's id; `null` (the default) without one. */
    cover?: string | null;
    /** A number of sets at 10 reps, 90 s rest and no weight, or each set. */
    exercises: {
      /** Its id; `<workout>-e<n>` from its position unless given. */
      id?: string;
      sets: number | SeedPlanSet[];
      slug: string;
    }[];
    id: string;
    name: string;
    /** Its place in the rotation; its position in `workouts` (from 1) unless given. */
    order?: number;
  }[];
}

const DEFAULT_PLAN_SET: SeedPlanSet = {
  reps_recommended: 10,
  rest_recommended: 90,
  weight_recommended: 0,
};

export interface SeedSession {
  exercises: SeedExercise[];
  finished?: boolean;
  id: string;
  /** Its Plan's id; `plan-1` unless given, `null` for none. */
  planId?: string | null;
  /** When it was started; one fixed instant unless given. */
  startedAt?: string;
  /** Its owner's Clerk id (see `SessionRow`). */
  userId?: string;
  /**
   * Its Workout's id; `workout-of-<id>` unless given, `null` once the Workout
   * is gone.
   */
  workoutId?: string | null;
}

/** The Exercise slug a seeded Exercise named `name` is stored by. */
export const slugOf = (name: string) => name.toLowerCase().replaceAll(" ", "-");

/** The Library's Exercise for a seeded name, for the fake library. */
export const libraryExerciseNamed = (name: string) =>
  libraryExercise(slugOf(name), { name });

const nestedPlan = ({
  deleted_at = null,
  description,
  // An explicit `null` is a detail this Plan leaves unset (ADR 0017); a
  // default only fills in a field the test left out.
  experience_level = "intermediate",
  frequency = 3,
  goal = "strength-performance",
  id,
  is_active = false,
  name,
  place = "gym",
  workout_duration = 60,
  workouts,
}: SeedPlan) => ({
  deleted_at,
  description: description === undefined ? `About ${name}` : description,
  experience_level,
  frequency,
  goal,
  id,
  is_active,
  name,
  place,
  workout_duration,
  workouts: workouts.map((workout, workoutIndex) => ({
    cover: workout.cover ?? null,
    exercises: workout.exercises.map((exercise, exerciseIndex) => {
      const exerciseId = exercise.id ?? `${workout.id}-e${exerciseIndex + 1}`;

      return {
        exercise_slug: exercise.slug,
        id: exerciseId,
        order: exerciseIndex + 1,
        sets: (Array.isArray(exercise.sets)
          ? exercise.sets
          : Array.from({ length: exercise.sets }, () => DEFAULT_PLAN_SET)
        ).map((set: SeedPlanSet, setIndex) => ({
          ...set,
          id: set.id ?? `${workout.id}-e${exerciseIndex + 1}-s${setIndex + 1}`,
          order: setIndex + 1,
        })),
        workout_id: workout.id,
      };
    }),
    id: workout.id,
    name: workout.name,
    order: workout.order ?? workoutIndex + 1,
    plan_id: id,
  })),
});

const createFakeRows = () => {
  const profiles: ProfileRow[] = [];
  const plans: SeedPlan[] = [];
  const sessions: SessionRow[] = [];
  const initialExercises: ExerciseRow[] = [];
  const initialSets: SetRow[] = [];

  const weeklyGoalChanges: { recorded_at: string; target: number | null }[] =
    [];

  const personalRecords: PersonalRecordRow[] = [];
  let nextId = 1;

  return {
    profiles,
    plans,
    sessions,
    exercises: initialExercises,
    sets: initialSets,
    /**
     * The User's Weekly goal changes, oldest first, as `GET /v1/weekly-goals`
     * answers them: seeded by the test (the fake's Plan writes don't record
     * them; the services do, and their integration tests cover it).
     */
    weeklyGoalChanges,
    personalRecords,
    /** Server-calculated result; the real calculation is covered at the service seam. */
    weeklyStreak: 0,

    reset() {
      this.profiles = [];
      this.plans = [];
      this.sessions = [];
      this.exercises = [];
      this.sets = [];
      this.weeklyGoalChanges = [];
      this.personalRecords = [];
      this.weeklyStreak = 0;
      nextId = 1;
    },

    id(prefix: string) {
      const id = `${prefix}-${nextId}`;
      nextId += 1;

      return id;
    },

    /**
     * Adds a session (of plan `plan-1`, unless `planId` says otherwise); its
     * exercises get ids `<session>-e<n>` and their sets ids
     * `<session>-e<n>-s<m>`, both counted from 1.
     */
    seed({
      exercises,
      finished = false,
      id,
      planId = "plan-1",
      startedAt = "2026-10-08T10:00:00.000Z",
      userId,
      workoutId = `workout-of-${id}`,
    }: SeedSession) {
      const session: SessionRow = {
        finished_at: finished ? "2026-10-08T11:00:00.000Z" : null,
        id,
        plan_id: planId,
        started_at: startedAt,
        workout_id: workoutId,
        workoutName: `Workout ${id}`,
      };

      if (userId) {
        session.user_id = userId;
      }

      this.sessions.push(session);

      for (const [exerciseIndex, { name, sets, slug }] of exercises.entries()) {
        const exerciseId = `${id}-e${exerciseIndex + 1}`;
        this.exercises.push({
          exercise_slug: slug ?? slugOf(name),
          id: exerciseId,
          order: exerciseIndex + 1,
          workout_session_id: id,
        });

        for (const [setIndex, reps] of sets.entries()) {
          this.sets.push({
            id: `${exerciseId}-s${setIndex + 1}`,
            logged_at: reps === null ? null : "2026-10-08T10:30:00.000Z",
            order: setIndex + 1,
            reps_completed: reps,
            reps_recommended: 10,
            rest_recommended: null,
            weight_completed: null,
            weight_recommended: null,
            workout_session_exercise_id: exerciseId,
          });
        }
      }
    },

    /** Adds a Profile (metric, unless `overrides` say otherwise). */
    seedProfile(userId: string, overrides: Partial<ProfileRow> = {}) {
      this.profiles.push({
        age: 30,
        gender: "female",
        height: 170,
        measurement_system: "metric",
        user_id: userId,
        weight: 60,
        ...overrides,
      });
    },

    profile(userId: string) {
      return this.profiles.find((profile) => profile.user_id === userId);
    },

    /** Adds a Plan; its Workout Exercises get ids `<workout>-e<n>`. */
    seedPlan(plan: SeedPlan) {
      this.plans.push(plan);
    },

    session(id: string) {
      return this.sessions.find((session) => session.id === id);
    },

    nestedPlan,
  };
};

export const backend = createFakeRows();

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
  /**
   * The request is answered as usual: queued before another failure, it
   * lets one request through and fails the next.
   */
  | "pass"
  /** The connection fails before any answer. */
  | "network"
  /** The request is applied, then the connection fails before the answer. */
  | "lost"
  /** An error answer; a 429 gets `Retry-After: retryAfterSeconds` (30). */
  | { code?: string; retryAfterSeconds?: number; status: number };

/**
 * Query parameters a request must carry to match, e.g.
 * `{ status: "in_progress" }` for the open Workout Session's read of
 * `GET /v1/workout-sessions`; every request to the route without one.
 */
export type QueryMatch = Record<string, string>;

const matchesQuery = (
  query: Record<string, string>,
  wanted: QueryMatch | undefined
) =>
  Object.entries(wanted ?? {}).every(([name, value]) => query[name] === value);

export interface ReceivedRequest {
  authorization: string | null;
  body: RequestBody;
  /** The path as sent, e.g. `/v1/workout-sessions/s1/finish`. */
  path: string;
  /** The query string's parameters, e.g. `{ status: "in_progress" }`. */
  query: Record<string, string>;
  /** The route it matched, path parameters as `{id}`. */
  route: string;
}

// `updateProfile`'s factors and rounding (`packages/services/src/profile.ts`).
const HEIGHT_FACTOR = 0.393701;
const WEIGHT_FACTOR = 2.20462;

const PROFILE_FIELDS = new Set([
  "age",
  "gender",
  "height",
  "measurement_system",
  "weight",
]);

const round2 = (value: number) => Math.round(value * 100) / 100;

const isImperial = (system: string) => system !== "metric";

// `getProfile`'s units (`packages/services/src/profile.ts`): us and uk are
// inches and pounds, anything else, an unknown system included, metric.
const unitsOf = (system: string) =>
  system === "us" || system === "uk"
    ? { height: "in", weight: "lbs" }
    : { height: "cm", weight: "kg" };

const json = <T>(status: number, body: T, headers: HeadersInit = {}) =>
  new Response(body === null ? null : JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      ...Object.fromEntries(new Headers(headers)),
    },
    status,
  });

const error = (
  status: number,
  code: string,
  message: string,
  headers?: HeadersInit
) => json(status, { error: { code, message } }, headers);

const notFound = (what: string) => error(404, "not_found", `${what} not found`);

const profileBody = (profile: ProfileRow) => {
  const { user_id: _userId, ...fields } = profile;

  return { ...fields, units: unitsOf(profile.measurement_system) };
};

/** Every Plan's own set targets: stored weights too. */
const convertPlanSets = (factor: number) => {
  for (const plan of backend.plans) {
    for (const workout of plan.workouts) {
      for (const exercise of workout.exercises) {
        if (!Array.isArray(exercise.sets)) {
          // The shorthand's sets have no weight to convert.
          continue;
        }

        for (const set of exercise.sets) {
          set.weight_recommended = round2(set.weight_recommended * factor);
        }
      }
    }
  }
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

  for (const record of backend.personalRecords) {
    record.weight = round2(record.weight * weight);
  }

  convertPlanSets(weight);
};

const hasAtMostBodyDecimals = (value: number) => {
  const scaled = value * 10 ** MAX_BODY_DECIMALS;

  return Math.abs(scaled - Math.round(scaled)) < 1e-9;
};

const requestBodySchema = z.json();

type RequestBody = z.infer<typeof requestBodySchema> | undefined;

type Body = Record<string, RequestBody>;

const isObject = <T>(value: T): value is T & Body =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isInteger = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= min &&
  value <= max;

const isText = (value: unknown, max: number, min = 0): value is string =>
  typeof value === "string" &&
  value.trim().length >= min &&
  value.length <= max;

const isBodyValue = (value: unknown, max: number): value is number =>
  typeof value === "number" &&
  value > 0 &&
  value <= max &&
  hasAtMostBodyDecimals(value);

/** The first field `PATCH /v1/profile`'s bounds refuse, if any. */
const invalidProfileField = (changes: Body) => {
  if (changes.age !== undefined && !isInteger(changes.age, MIN_AGE, MAX_AGE)) {
    return "age";
  }

  if (
    changes.gender !== undefined &&
    !genders.some((gender) => gender === changes.gender)
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
const profileFieldsError = (changes: Body) => {
  const invalid = invalidProfileField(changes);

  if (invalid) {
    return error(400, "invalid_request", `${invalid}: out of bounds`);
  }

  const system = changes.measurement_system;

  if (
    system !== undefined &&
    !measurementSystems.some((option) => option === system)
  ) {
    return error(400, "invalid_request", "measurement_system: Invalid option");
  }

  return null;
};

const profileChangesSchema = z.strictObject({
  age: z.number().optional(),
  gender: z.enum(genders).optional(),
  height: z.number().optional(),
  measurement_system: z.enum(measurementSystems).optional(),
  weight: z.number().optional(),
});

const startSessionSchema = z.strictObject({ workout_id: z.string() });
const sessionExerciseSchema = z.strictObject({ exercise_slug: z.string() });

const completedSetSchema = z.strictObject({
  reps_completed: z.number().refine(Number.isInteger),
  weight_completed: z.union([
    z.number(),
    z.literal(Infinity),
    z.literal(-Infinity),
  ]),
});

/** Applies `changes` to `profile`, converting to a new system first. */
const applyProfileChanges = (
  profile: ProfileRow,
  changes: z.infer<typeof profileChangesSchema>
) => {
  if (changes.measurement_system !== undefined) {
    convert(profile, changes.measurement_system);
  }

  Object.assign(profile, changes);
};

/** `GET /v1/profile`: the Profile, or `{ data: null }` before onboarding. */
const getProfile = (): Response => {
  const profile = backend.profile(FAKE_USER_ID);

  return json(200, { data: profile ? profileBody(profile) : null });
};

const patchProfile = (body: RequestBody): Response => {
  if (
    !isObject(body) ||
    Object.keys(body).length === 0 ||
    Object.keys(body).some((key) => !PROFILE_FIELDS.has(key))
  ) {
    return error(400, "invalid_request", "Invalid profile changes");
  }

  const invalid = profileFieldsError(body);

  if (invalid) {
    return invalid;
  }

  const profile = backend.profile(FAKE_USER_ID);

  if (!profile) {
    return error(404, "profile_not_found", "Profile not found");
  }

  const changes = profileChangesSchema.parse(body);
  applyProfileChanges(profile, changes);

  return json(200, { data: profileBody(profile) });
};

/**
 * `PUT /v1/profile`: every field required, with the PATCH bounds; creates the
 * Profile (201) or replaces it as a PATCH with every field would (200).
 */
const putProfile = (body: RequestBody): Response => {
  if (
    !isObject(body) ||
    Object.keys(body).length !== PROFILE_FIELDS.size ||
    Object.keys(body).some((key) => !PROFILE_FIELDS.has(key))
  ) {
    return error(400, "invalid_request", "Invalid profile");
  }

  const invalid = profileFieldsError(body);

  if (invalid) {
    return invalid;
  }

  const whole = profileChangesSchema.required().parse(body);
  const existing = backend.profile(FAKE_USER_ID);

  if (existing) {
    applyProfileChanges(existing, whole);

    return json(200, { data: profileBody(existing) });
  }

  const created = { ...whole, user_id: FAKE_USER_ID };
  backend.profiles.push(created);

  return json(201, { data: profileBody(created) });
};

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

/**
 * One of the four details a Plan may leave unset (ADR 0017): left out or
 * `null` it passes, and anything else must be a value the API would take.
 */
const isUnsetOr = (
  value: RequestBody,
  isValid: (value: RequestBody) => boolean
) => value === undefined || value === null || isValid(value);

/**
 * The four details a write may leave unset (ADR 0017), as the Plan then
 * stores them: `null` for each one left out.
 */
const planDetailsOf = (
  body: Body
): Required<
  Pick<SeedPlan, "experience_level" | "goal" | "place" | "workout_duration">
> => ({
  experience_level: (body.experience_level as ExperienceLevel) ?? null,
  goal: (body.goal as Goal) ?? null,
  place: (body.place as Place) ?? null,
  workout_duration: (body.workout_duration as number) ?? null,
});

/**
 * A Plan's details as its writes take them, but its description. Only the
 * name and the frequency are required: the four details are optional
 * (ADR 0017).
 */
const hasPlanDetails = (body: Body) =>
  isUnsetOr(body.experience_level, (level) =>
    experienceLevels.some((known) => known === level)
  ) &&
  isInteger(body.frequency, MIN_FREQUENCY, MAX_FREQUENCY) &&
  isUnsetOr(body.goal, (goal) => goals.some((known) => known === goal)) &&
  isText(body.name, MAX_PLAN_NAME_LENGTH, 1) &&
  (body.note === undefined ||
    body.note === null ||
    isText(body.note, MAX_PLAN_TEXT_LENGTH)) &&
  isUnsetOr(body.place, (place) => places.some((known) => known === place)) &&
  isUnsetOr(body.workout_duration, (duration) =>
    isInteger(duration, 1, MAX_WORKOUT_DURATION_MINUTES)
  );

/** `POST /v1/plans`'s schema (`apps/api/src/routes/plans.ts`), the bounds included. */
const isNewPlan = (
  body: RequestBody
): body is RequestBody &
  Body & {
    activate?: boolean;
    description: string;
    frequency: number;
    name: string;
    workouts: NewPlanWorkout[];
  } =>
  isObject(body) &&
  unknownFields(body, PLAN_FIELDS).length === 0 &&
  (body.activate === undefined || typeof body.activate === "boolean") &&
  isText(body.description, MAX_PLAN_TEXT_LENGTH) &&
  hasPlanDetails(body) &&
  isList(body.workouts, MAX_WORKOUTS_PER_PLAN) &&
  body.workouts.every(isPlanWorkout);

/** An optional id, as `PUT /v1/plans/{id}`'s body sends a kept row's. */
const isOptionalId = (id: unknown): id is string | undefined =>
  id === undefined || (typeof id === "string" && id !== "");

/** A row's fields without its `id`, for the checks the create shares. */
const withoutId = ({ id: _id, ...fields }: Body) => fields;

interface SavedPlanSet extends SeedPlanSet {
  id?: string;
}

interface SavedPlanExercise {
  exercise_slug: string;
  id?: string;
  sets: SavedPlanSet[];
}

interface SavedPlanWorkout {
  description?: string;
  exercises: SavedPlanExercise[];
  id?: string;
  name: string;
}

const isSavedPlanExercise = (
  exercise: unknown
): exercise is SavedPlanExercise =>
  isObject(exercise) &&
  isOptionalId(exercise.id) &&
  unknownFields(exercise, ["exercise_slug", "id", "sets"]).length === 0 &&
  typeof exercise.exercise_slug === "string" &&
  exercise.exercise_slug !== "" &&
  isList(exercise.sets, MAX_SETS_PER_EXERCISE) &&
  exercise.sets.every(
    (set) => isObject(set) && isOptionalId(set.id) && isPlanSet(withoutId(set))
  );

const isSavedPlanWorkout = (workout: unknown): workout is SavedPlanWorkout =>
  isObject(workout) &&
  isOptionalId(workout.id) &&
  unknownFields(workout, ["description", "exercises", "id", "name"]).length ===
    0 &&
  (workout.description === undefined ||
    isText(workout.description, MAX_PLAN_TEXT_LENGTH)) &&
  isText(workout.name, MAX_PLAN_NAME_LENGTH, 1) &&
  isList(workout.exercises, MAX_EXERCISES_PER_WORKOUT) &&
  workout.exercises.every(isSavedPlanExercise);

/**
 * `PUT /v1/plans/{id}`'s schema: `POST /v1/plans`' without `activate`, each
 * row with an optional id, the descriptions optional.
 */
const isSavedPlan = (
  body: RequestBody
): body is RequestBody &
  Body & {
    description?: string;
    frequency: number;
    name: string;
    workouts: SavedPlanWorkout[];
  } =>
  isObject(body) &&
  unknownFields(body, PLAN_FIELDS).length === 0 &&
  body.activate === undefined &&
  (body.description === undefined ||
    isText(body.description, MAX_PLAN_TEXT_LENGTH)) &&
  hasPlanDetails(body) &&
  isList(body.workouts, MAX_WORKOUTS_PER_PLAN) &&
  body.workouts.every(isSavedPlanWorkout);

const PLAN_CREATED_AT = "2026-10-01T09:00:00.000Z";

const isOwn = (plan: SeedPlan) =>
  (plan.user_id ?? FAKE_USER_ID) === FAKE_USER_ID;

/** The User's Plan with that id, live or deleted; never another User's. */
const ownPlan = (planId: string) =>
  backend.plans.find((plan) => plan.id === planId && isOwn(plan));

const weightUnit = () =>
  unitsOf(backend.profile(FAKE_USER_ID)?.measurement_system ?? "metric").weight;

/**
 * A Plan in full, as `GET /v1/plans/{id}` answers it: Workouts in rotation
 * order, each with its Cover id, Exercises and sets in order, and the User's
 * `weight_unit` (weights as stored). A detail the seed left unset (ADR 0017)
 * is answered as `null`.
 */
const planBody = (plan: SeedPlan) => {
  const {
    deleted_at: _deleted,
    workouts,
    ...fields
  } = backend.nestedPlan(plan);

  return {
    ...fields,
    created_at: PLAN_CREATED_AT,
    note: null,
    updated_at: PLAN_CREATED_AT,
    weight_unit: weightUnit(),
    workouts: workouts
      .toSorted((a, b) => a.order - b.order)
      .map(({ exercises, plan_id: _plan, ...workout }) => ({
        ...workout,
        description: "",
        exercises: exercises.map(
          ({ workout_id: _workout, ...exercise }) => exercise
        ),
      })),
  };
};

/** A Plan as `GET /v1/plans` lists it: its Workouts summarised, no unit. */
const planSummaryBody = (plan: SeedPlan) => {
  const { weight_unit: _unit, workouts, ...fields } = planBody(plan);

  return {
    ...fields,
    workouts: workouts.map(({ cover, exercises, id, name, order }) => ({
      cover,
      exercise_count: exercises.length,
      id,
      name,
      order,
    })),
  };
};

/** The User's live Plans, newest (last seeded) first. */
const listPlans = (): Response =>
  json(200, {
    data: backend.plans
      .filter((plan) => isOwn(plan) && !plan.deleted_at)
      .toReversed()
      .map(planSummaryBody),
  });

/**
 * The User's active Plan in full, as `GET /v1/plans/active` answers it, or
 * `{ data: null }` without one (a deleted Plan is never active).
 */
const getActivePlan = (): Response => {
  const plan = backend.plans.find(
    (candidate) =>
      isOwn(candidate) && !candidate.deleted_at && candidate.is_active
  );

  return json(200, { data: plan ? planBody(plan) : null });
};

/** A live Plan of the User's in full; 404 for a missing, deleted or another User's. */
const getPlan = (_body: RequestBody, planId: string): Response => {
  const plan = ownPlan(planId);

  if (!plan || plan.deleted_at) {
    return notFound("Plan");
  }

  return json(200, { data: planBody(plan) });
};

/**
 * Checks every slug against the fake Library (`serveLibrary`, its
 * `failWith` for an outage), then saves the Plan into the fake backend's
 * rows, active unless `activate: false`.
 */
const createPlan = async (body: RequestBody): Promise<Response> => {
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
    ...planDetailsOf(body),
    description: body.description ?? null,
    frequency: body.frequency,
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

  return json(201, { data: planBody(plan) });
};

/**
 * The sent ids the save can't keep, as the services find them: one that
 * isn't the Plan's, sits under another parent than it's sent under, or is
 * sent twice.
 */
const invalidPlanIds = (plan: SeedPlan, workouts: SavedPlanWorkout[]) => {
  const tree = backend.nestedPlan(plan).workouts;

  const parentOf = new Map<string, string | null>([
    ...tree.map((workout) => [workout.id, null] as const),
    ...tree.flatMap((workout) =>
      workout.exercises.flatMap((exercise) => [
        [exercise.id, workout.id] as const,
        ...exercise.sets.map((set) => [set.id, exercise.id] as const),
      ])
    ),
  ]);

  const seen = new Set<string>();
  const invalid = new Set<string>();

  const check = (id: string | undefined, parent: string | null | undefined) => {
    if (id === undefined) {
      return;
    }

    if (seen.has(id) || !parentOf.has(id) || parentOf.get(id) !== parent) {
      invalid.add(id);
    }

    seen.add(id);
  };

  for (const workout of workouts) {
    check(workout.id, null);

    for (const exercise of workout.exercises) {
      check(exercise.id, workout.id);

      for (const set of exercise.sets) {
        check(set.id, exercise.id);
      }
    }
  }

  return [...invalid];
};

/**
 * Checks every slug against the fake Library like `createPlan`, then saves
 * the whole Plan over its rows as the services do (ADR 0016): a row sent with
 * its id keeps it (a Workout its Cover), one sent without gets a new one, and
 * one left out is gone. New Workouts get no Cover, as the fake's creates
 * don't; whether it's active doesn't change.
 */
const savePlan = async (
  body: RequestBody,
  planId: string
): Promise<Response> => {
  if (!isSavedPlan(body)) {
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

  const plan = ownPlan(planId);

  if (!plan || plan.deleted_at) {
    return notFound("Plan");
  }

  const invalid = invalidPlanIds(plan, body.workouts);

  if (invalid.length > 0) {
    return error(
      400,
      "invalid_request",
      `Not this Plan's, or not under the parent sent: ${invalid.join(", ")}`
    );
  }

  const covers = new Map(
    plan.workouts.map((workout) => [workout.id, workout.cover ?? null])
  );

  Object.assign(plan, {
    ...planDetailsOf(body),
    description: body.description ?? null,
    frequency: body.frequency,
    name: body.name,
    workouts: body.workouts.map((workout, index) => {
      const workoutId = workout.id ?? backend.id("workout");

      return {
        cover: covers.get(workoutId) ?? null,
        exercises: workout.exercises.map((exercise) => ({
          id: exercise.id ?? backend.id("workout-exercise"),
          sets: exercise.sets.map((set) => ({
            ...set,
            id: set.id ?? backend.id("workout-exercise-set"),
          })),
          slug: exercise.exercise_slug,
        })),
        id: workoutId,
        name: workout.name,
        order: index + 1,
      };
    }),
  });

  return json(200, { data: planBody(plan) });
};

/** The Plan becomes active, every other one of the User inactive. */
const activatePlan = (_body: RequestBody, planId: string): Response => {
  const plan = ownPlan(planId);

  if (!plan || plan.deleted_at) {
    return error(404, "not_found", "Plan not found");
  }

  for (const other of backend.plans.filter(isOwn)) {
    other.is_active = other === plan;
  }

  return json(200, { data: planBody(plan) });
};

/** A soft delete; a Plan already deleted answers 204 again. */
const deletePlan = (_body: RequestBody, planId: string): Response => {
  const plan = ownPlan(planId);

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

/** The User's Workout Session with that id; never another User's. */
const ownSession = (sessionId: string) => {
  const session = backend.session(sessionId);

  return session && (session.user_id ?? FAKE_USER_ID) === FAKE_USER_ID
    ? session
    : undefined;
};

const setBody = ({ workout_session_exercise_id: _exercise, ...set }: SetRow) =>
  set;

/** A Workout Session in full, as `GET /v1/workout-sessions/{id}` shows it. */
const sessionBody = (session: SessionRow) => {
  const plan = backend.plans.find(({ id }) => id === session.plan_id);

  return {
    exercises: backend.exercises
      .filter((exercise) => exercise.workout_session_id === session.id)
      .toSorted((a, b) => a.order - b.order)
      .map(({ exercise_slug, id, order }) => ({
        exercise_slug,
        id,
        order,
        sets: backend.sets
          .filter((set) => set.workout_session_exercise_id === id)
          .toSorted((a, b) => a.order - b.order)
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

const SUMMARY_LIMITS = { default: 20, max: 50 } as const;

/**
 * `listWorkoutSessions`: a page of the User's Workout Sessions, newest start
 * first, each with its counts, completed reps and volume (weight × reps over
 * its logged sets), in the Profile's unit. `limit` (1–50, default 20),
 * `offset` and `status` (`all`, `in_progress`, `finished`) as the API reads
 * them; an offset past the end is an empty page.
 */
const listSessions = (
  _body: RequestBody,
  _id: string,
  query: URLSearchParams
): Response => {
  const limit = Number(query.get("limit") ?? SUMMARY_LIMITS.default);
  const offset = Number(query.get("offset") ?? 0);
  const status = query.get("status") ?? "all";

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > SUMMARY_LIMITS.max ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    !["all", "finished", "in_progress"].includes(status)
  ) {
    return error(400, "invalid_request", "limit, offset or status: Invalid");
  }

  const matching = backend.sessions
    .filter(
      (session) =>
        status === "all" ||
        (status === "finished") === (session.finished_at !== null)
    )
    .toSorted(
      (a, b) =>
        b.started_at.localeCompare(a.started_at) || a.id.localeCompare(b.id)
    );

  const page = matching.slice(offset, offset + limit).map((session) => {
    const { exercises, ...body } = sessionBody(session);
    const sets = exercises.flatMap((exercise) => exercise.sets);
    const { weight_unit: _unit, ...summary } = body;

    return {
      ...summary,
      completed_rep_count: sets.reduce(
        (total, set) => total + (set.reps_completed ?? 0),
        0
      ),
      exercise_count: exercises.length,
      logged_set_count: sets.filter((set) => set.logged_at !== null).length,
      personal_records: backend.personalRecords
        .filter((record) => record.workout_session_id === session.id)
        .map(({ workout_session_id: _session, ...record }) => record)
        .toSorted((a, b) => a.exercise_slug.localeCompare(b.exercise_slug)),
      set_count: sets.length,
      volume: round2(
        sets.reduce(
          (total, set) =>
            total + (set.weight_completed ?? 0) * (set.reps_completed ?? 0),
          0
        )
      ),
    };
  });

  return json(200, {
    data: page,
    hasMore: offset + page.length < matching.length,
    total: matching.length,
    weight_unit: weightUnit(),
  });
};

/**
 * `getWorkoutSession`: the User's Workout Session in full; 404 for a missing
 * or another User's.
 */
const getSession = (_body: RequestBody, sessionId: string): Response => {
  const session = ownSession(sessionId);

  return session
    ? json(200, { data: sessionBody(session) })
    : notFound("Workout Session");
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
 * `startWorkoutSession`: resumes the Workout's open Workout Session (200),
 * refuses while another Workout's is open (409 `session_in_progress`; the
 * User has at most one), or starts one copying the Workout's Exercises and
 * sets (201), as `backend.nestedPlan` shows them.
 */
const startSession = (body: RequestBody): Response => {
  const parsed = startSessionSchema.safeParse(body);

  if (!parsed.success) {
    return error(400, "invalid_request", "workout_id: Required");
  }

  const { workout_id: workoutId } = parsed.data;

  const found = findWorkout(workoutId);

  if (!found) {
    return notFound("Workout");
  }

  const open = backend.sessions.find((other) => other.finished_at === null);

  if (open?.workout_id === workoutId) {
    return json(200, { data: sessionBody(open) });
  }

  if (open) {
    const openWorkout = open.workout_id ? findWorkout(open.workout_id) : null;

    return error(
      409,
      "session_in_progress",
      openWorkout
        ? `Workout "${openWorkout.workout.name}" is in progress (Workout Session ${open.id}); finish it before starting another`
        : `Workout Session ${open.id} is in progress; finish it before starting another`
    );
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

/** The logged sets of a Workout Session's Exercises, by Exercise slug. */
const setsBySlug = (sessionId: string) => {
  const bySlug = new Map<string, SetRow[]>();

  for (const exercise of backend.exercises) {
    if (exercise.workout_session_id !== sessionId) {
      continue;
    }

    bySlug.set(exercise.exercise_slug, [
      ...(bySlug.get(exercise.exercise_slug) ?? []),
      ...backend.sets.filter(
        (set) => set.workout_session_exercise_id === exercise.id
      ),
    ]);
  }

  return bySlug;
};

/**
 * `awardPersonalRecords`: per Exercise, `@fitme/core`'s rule against the best
 * result in every other finished Workout Session.
 */
const awardPersonalRecords = (sessionId: string) => {
  const earlier = backend.sessions.filter(
    (other) => other.id !== sessionId && other.finished_at !== null
  );

  for (const [slug, sets] of setsBySlug(sessionId)) {
    const record = personalRecordFor(
      recordResult(
        earlier.flatMap((other) => setsBySlug(other.id).get(slug) ?? [])
      ),
      sets
    );

    if (record) {
      backend.personalRecords.push({
        ...record,
        exercise_slug: slug,
        workout_session_id: sessionId,
      });
    }
  }
};

/**
 * `finishWorkoutSession`: finishes the Workout Session, awards the Personal
 * records it earned and moves its Workout to the end of its Plan's rotation;
 * a repeat changes nothing.
 */
const finishSession = (_body: RequestBody, sessionId: string): Response => {
  const session = backend.session(sessionId);

  if (!session) {
    return notFound("Workout Session");
  }

  if (session.finished_at !== null) {
    return json(200, { already_finished: true, data: sessionBody(session) });
  }

  awardPersonalRecords(sessionId);
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
const logSet = (body: RequestBody, setId: string): Response => {
  const parsed = completedSetSchema.safeParse(body);

  if (!parsed.success) {
    return error(400, "invalid_request", "Invalid set");
  }

  const { reps_completed, weight_completed } = parsed.data;

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
  body: RequestBody,
  sessionId: string
): Promise<Response> => {
  const parsed = sessionExerciseSchema.safeParse(body);

  if (!parsed.success) {
    return error(400, "invalid_request", "exercise_slug: Required");
  }

  const { exercise_slug: exerciseSlug } = parsed.data;

  const refusal = await refuseUnknownSlug(exerciseSlug);

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
    exercise_slug: exerciseSlug,
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

const logged = (sets: SetRow[]) =>
  sets.filter((set) => set.reps_completed !== null);

const toSet = (set: SetRow, rest: number): PlanUpdateSet => ({
  // SAFETY: callers select only logged sets, whose reps_completed is non-null.
  reps: set.reps_completed as number,
  rest,
  weight: set.weight_completed ?? 0,
});

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
        .toSorted((a, b) => a.order - b.order),
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
  ].toSorted((a, b) => a - b);

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
  (_body: RequestBody, sessionId: string): Response => {
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
        workout: { cover: null, id: workout.id, name: workout.name },
      },
    });
  };

const HISTORY_LIMITS = { default: 20, max: 50 } as const;

/**
 * `getExerciseHistory`: a page of the User's history for one Exercise, newest
 * Workout Session first (by `started_at`; an Exercise added to the same one
 * twice keeps its place in it), each entry its Workout Session Exercise id,
 * its Workout Session's timestamps and its logged sets in order. A set counts
 * once its reps are logged, a bodyweight set (no weight) included; an entry
 * left with no counted set is out of the page and of `total`. `exercise_slug`
 * is required and never checked against the Library (an unknown one answers an
 * empty page); `limit` (1–50, default 20) and `offset` as the API reads them.
 */
const listExerciseHistory = (
  _body: RequestBody,
  _id: string,
  query: URLSearchParams
): Response => {
  const exerciseSlug = query.get("exercise_slug");
  const limit = Number(query.get("limit") ?? HISTORY_LIMITS.default);
  const offset = Number(query.get("offset") ?? 0);

  if (!exerciseSlug) {
    return error(400, "invalid_request", "exercise_slug: Required");
  }

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > HISTORY_LIMITS.max ||
    !Number.isInteger(offset) ||
    offset < 0
  ) {
    return error(400, "invalid_request", "limit or offset: Invalid");
  }

  const matching = backend.exercises
    .filter((exercise) => exercise.exercise_slug === exerciseSlug)
    .flatMap((exercise) => {
      const session = ownSession(exercise.workout_session_id);

      const sets = backend.sets
        .filter(
          (set) =>
            set.workout_session_exercise_id === exercise.id &&
            set.reps_completed !== null
        )
        .toSorted((a, b) => a.order - b.order || a.id.localeCompare(b.id));

      // An entry with no logged set never shows, nor counts in `total`.
      return session && sets.length > 0 ? [{ exercise, session, sets }] : [];
    })
    .toSorted(
      (a, b) =>
        b.session.started_at.localeCompare(a.session.started_at) ||
        b.session.id.localeCompare(a.session.id) ||
        a.exercise.order - b.exercise.order ||
        a.exercise.id.localeCompare(b.exercise.id)
    );

  const page = matching
    .slice(offset, offset + limit)
    .map(({ exercise, session, sets }) => ({
      id: exercise.id,
      session: {
        finished_at: session.finished_at,
        id: session.id,
        started_at: session.started_at,
      },
      sets: sets.map(({ id, order, ...set }) => ({
        id,
        order,
        reps_completed: set.reps_completed,
        reps_recommended: set.reps_recommended,
        weight_completed: set.weight_completed,
        weight_recommended: set.weight_recommended,
      })),
    }));

  return json(200, {
    data: page,
    hasMore: offset + page.length < matching.length,
    total: matching.length,
    weight_unit: weightUnit(),
  });
};

/**
 * `removeExerciseFromWorkoutSession`: deletes the Exercise and its sets,
 * leaving the others' `order` (the gap stays); 204 whether or not it matched.
 */
const removeSessionExercise = (_body: RequestBody, exerciseId: string) => {
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
  body: RequestBody,
  exerciseId: string
): Promise<Response> => {
  const parsed = sessionExerciseSchema.safeParse(body);

  if (!parsed.success) {
    return error(400, "invalid_request", "exercise_slug: Required");
  }

  const { exercise_slug: exerciseSlug } = parsed.data;

  const refusal = await refuseUnknownSlug(exerciseSlug);

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

  exercise.exercise_slug = exerciseSlug;

  const sets = backend.sets
    .filter((set) => set.workout_session_exercise_id === exerciseId)
    .toSorted((a, b) => a.order - b.order);

  for (const set of sets) {
    Object.assign(set, { reps_recommended: 0, weight_recommended: 0 });
  }

  const { workout_session_id: _session, ...shown } = exercise;

  return json(200, {
    data: { ...shown, sets: sets.map(setBody), weight_unit: weightUnit() },
  });
};

/**
 * `addSetToWorkoutSessionExercise`: appends a set logged with the server's
 * time and no targets, after the Workout Session Exercise's last one.
 */
const addSessionSet = (body: RequestBody, exerciseId: string): Response => {
  const parsed = completedSetSchema.safeParse(body);

  if (!parsed.success) {
    return error(400, "invalid_request", "Invalid set");
  }

  const { reps_completed, weight_completed } = parsed.data;

  const exercise = backend.exercises.find(({ id }) => id === exerciseId);
  const session = exercise && backend.session(exercise.workout_session_id);

  if (!session) {
    return notFound("Workout Session Exercise");
  }

  const notOpen = refuseFinished(session);

  if (notOpen) {
    return notOpen;
  }

  const last = Math.max(
    0,
    ...backend.sets
      .filter((set) => set.workout_session_exercise_id === exerciseId)
      .map(({ order }) => order)
  );

  const added: SetRow = {
    id: backend.id("added-set"),
    logged_at: LOGGED_AT,
    order: last + 1,
    reps_completed,
    reps_recommended: null,
    rest_recommended: null,
    weight_completed,
    weight_recommended: null,
    workout_session_exercise_id: exerciseId,
  };

  backend.sets.push(added);

  return json(201, { data: { ...setBody(added), weight_unit: weightUnit() } });
};

/** The seeded Weekly goal changes, oldest first. */
const listWeeklyGoals = () =>
  json(200, { data: backend.weeklyGoalChanges, streak: backend.weeklyStreak });

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

type Handler = (
  body: RequestBody,
  id: string,
  query: URLSearchParams
) => Promise<Response> | Response;

/** Every route the fake answers, each path parameter as `(?<id>…)`. */
const ROUTES: {
  handler: Handler;
  path: RegExp;
  /** Answered without a bearer, like the API's global routes. */
  isPublic?: boolean;
  route: Route;
}[] = [
  {
    handler: listArnoldModels,
    isPublic: true,
    path: /^\/v1\/arnold\/models$/u,
    route: "GET /v1/arnold/models",
  },
  {
    handler: getProfile,
    path: /^\/v1\/profile$/u,
    route: "GET /v1/profile",
  },
  {
    handler: patchProfile,
    path: /^\/v1\/profile$/u,
    route: "PATCH /v1/profile",
  },
  {
    handler: putProfile,
    path: /^\/v1\/profile$/u,
    route: "PUT /v1/profile",
  },
  {
    handler: listPlans,
    path: /^\/v1\/plans$/u,
    route: "GET /v1/plans",
  },
  {
    handler: createPlan,
    path: /^\/v1\/plans$/u,
    route: "POST /v1/plans",
  },
  {
    handler: getActivePlan,
    path: /^\/v1\/plans\/active$/u,
    route: "GET /v1/plans/active",
  },
  {
    handler: activatePlan,
    path: /^\/v1\/plans\/(?<id>[^/]+)\/activate$/u,
    route: "POST /v1/plans/{id}/activate",
  },
  {
    handler: deletePlan,
    path: /^\/v1\/plans\/(?<id>[^/]+)$/u,
    route: "DELETE /v1/plans/{id}",
  },
  {
    handler: getPlan,
    path: /^\/v1\/plans\/(?<id>[^/]+)$/u,
    route: "GET /v1/plans/{id}",
  },
  {
    handler: savePlan,
    path: /^\/v1\/plans\/(?<id>[^/]+)$/u,
    route: "PUT /v1/plans/{id}",
  },
  {
    handler: listWeeklyGoals,
    path: /^\/v1\/weekly-goals$/u,
    route: "GET /v1/weekly-goals",
  },
  {
    handler: listSessions,
    path: /^\/v1\/workout-sessions$/u,
    route: "GET /v1/workout-sessions",
  },
  {
    handler: startSession,
    path: /^\/v1\/workout-sessions$/u,
    route: "POST /v1/workout-sessions",
  },
  {
    handler: getSession,
    path: /^\/v1\/workout-sessions\/(?<id>[^/]+)$/u,
    route: "GET /v1/workout-sessions/{id}",
  },
  {
    handler: finishSession,
    path: /^\/v1\/workout-sessions\/(?<id>[^/]+)\/finish$/u,
    route: "POST /v1/workout-sessions/{id}/finish",
  },
  {
    handler: addSessionExercise,
    path: /^\/v1\/workout-sessions\/(?<id>[^/]+)\/exercises$/u,
    route: "POST /v1/workout-sessions/{id}/exercises",
  },
  {
    handler: planUpdate(false),
    path: /^\/v1\/workout-sessions\/(?<id>[^/]+)\/plan-update$/u,
    route: "GET /v1/workout-sessions/{id}/plan-update",
  },
  {
    handler: planUpdate(true),
    path: /^\/v1\/workout-sessions\/(?<id>[^/]+)\/plan-update$/u,
    route: "POST /v1/workout-sessions/{id}/plan-update",
  },
  {
    handler: listExerciseHistory,
    path: /^\/v1\/workout-session-exercises$/u,
    route: "GET /v1/workout-session-exercises",
  },
  {
    handler: removeSessionExercise,
    path: /^\/v1\/workout-session-exercises\/(?<id>[^/]+)$/u,
    route: "DELETE /v1/workout-session-exercises/{id}",
  },
  {
    handler: replaceSessionExercise,
    path: /^\/v1\/workout-session-exercises\/(?<id>[^/]+)$/u,
    route: "PUT /v1/workout-session-exercises/{id}",
  },
  {
    handler: addSessionSet,
    path: /^\/v1\/workout-session-exercises\/(?<id>[^/]+)\/sets$/u,
    route: "POST /v1/workout-session-exercises/{id}/sets",
  },
  {
    handler: logSet,
    path: /^\/v1\/workout-session-sets\/(?<id>[^/]+)$/u,
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
  /** Requests sent and not yet answered (or failed). */
  inFlight = 0;
  private failures: {
    failure: Failure;
    query?: QueryMatch;
    route: string;
  }[] = [];
  private pauses: {
    query?: QueryMatch;
    resumed: Promise<void>;
    route: string;
  }[] = [];

  reset() {
    appliedPlanUpdates.clear();
    this.baseUrl = FAKE_PUBLIC_API_URL;
    this.requests = [];
    this.unhandled = [];
    this.inFlight = 0;
    this.failures = [];
    this.pauses = [];
  }

  /**
   * Holds requests to `route` (carrying `query`, when given) unanswered until
   * the returned function is called, like a slow connection.
   */
  pause(route: Route, query?: QueryMatch) {
    const { promise: resumed, resolve: resume } =
      Promise.withResolvers<undefined>();

    const pause = { query, resumed, route };
    this.pauses.push(pause);

    return () => {
      this.pauses = this.pauses.filter((other) => other !== pause);
      resume(undefined);
    };
  }

  /** Makes the next request to `route` (carrying `query`, when given) fail. */
  failNext(route: Route, failure: Failure, query?: QueryMatch) {
    this.failures.push({ failure, query, route });
  }

  /** Requests to `route` so far (carrying `query`, when given). */
  count(route: Route, query?: QueryMatch) {
    return this.requests.filter(
      (request) => request.route === route && matchesQuery(request.query, query)
    ).length;
  }

  fetch: PublicApiFetch = async (url, init) => {
    this.inFlight += 1;

    try {
      return await this.respond(url, init);
    } finally {
      this.inFlight -= 1;
    }
  };

  private async respond(...[url, init]: Parameters<PublicApiFetch>) {
    const { pathname, searchParams } = new URL(url);
    const matched = match(init.method ?? "GET", pathname);
    const { route } = matched;
    const authorization = new Headers(init.headers).get("Authorization");

    const encoded = z.string().safeParse(init.body);

    // SAFETY: JSON.parse decodes the string into the RequestBody JSON value contract.
    const body =
      encoded.success && encoded.data !== ""
        ? (JSON.parse(encoded.data) as RequestBody)
        : undefined;

    const query = Object.fromEntries(searchParams);
    this.requests.push({ authorization, body, path: pathname, query, route });

    const matches = (held: { query?: QueryMatch; route: string }) =>
      held.route === route && matchesQuery(query, held.query);

    // Answers on a later macrotask, like a network response.
    const { promise, resolve } = Promise.withResolvers<undefined>();
    setTimeout(resolve, 0);
    await promise;
    await this.pauses.find(matches)?.resumed;

    const queued = this.failures.find(matches);

    if (queued) {
      this.failures = this.failures.filter((other) => other !== queued);
      const { failure } = queued;

      if (failure === "pass") {
        return await this.answer(matched, authorization, body, searchParams);
      }

      if (failure === "lost") {
        await this.answer(matched, authorization, body, searchParams);
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

    return await this.answer(matched, authorization, body, searchParams);
  }

  private answer(
    { handler, id, isPublic, route }: ReturnType<typeof match>,
    authorization: string | null,
    body: RequestBody,
    query: URLSearchParams
  ) {
    if (!handler) {
      this.unhandled.push(route);

      return error(501, "not_implemented", `Fake Public API: no ${route}`);
    }

    if (!isPublic && authorization !== `Bearer ${FAKE_SESSION_TOKEN}`) {
      return error(401, "unauthorized", "Unauthorized");
    }

    return handler(body, id, query);
  }
}

export const fakePublicApi = new FakePublicApi();
