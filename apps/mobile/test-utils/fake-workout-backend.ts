import { libraryExercise } from "./fake-exercise-library";

/**
 * In-memory stand-in for the Supabase client, covering the Profile and Plan
 * reads and the workout session queries and mutations the session screens
 * make. The fake Public API (`fake-public-api.ts`) answers over the same rows,
 * so a write through it shows in the next Supabase read. Rows live in plain
 * arrays and every request resolves asynchronously, like the network would,
 * so screens refetch, race and fail the way they do against a real backend.
 */

interface SessionRow {
  finished_at: string | null;
  id: string;
  plan_id: string | null;
  started_at: string;
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

interface ExerciseRow {
  exercise_slug: string;
  id: string;
  order: number;
  workout_session_id: string;
}

interface SetRow {
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

type Operation = "delete" | "insert" | "rpc" | "select" | "update";

interface Request {
  operation: Operation;
  table: string;
}

interface Failure extends Request {
  error: Error;
}

/**
 * Sets of an exercise, as `reps_completed` values (`null` = untracked). The
 * Exercise is stored by slug: `slug`, or one made from `name` ("Bench Press"
 * → `bench-press`), which `libraryExerciseNamed` serves under that name.
 */
export interface SeedExercise {
  name: string;
  sets: Array<number | null>;
  slug?: string;
}

export interface SeedPlan {
  id: string;
  name: string;
  workouts: Array<{
    exercises: Array<{ sets: number; slug: string }>;
    id: string;
    name: string;
  }>;
}

export interface SeedSession {
  exercises: SeedExercise[];
  finished?: boolean;
  id: string;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** The Exercise slug a seeded Exercise named `name` is stored by. */
export const slugOf = (name: string) => name.toLowerCase().replaceAll(" ", "-");

/** The Exercise Library's Exercise for a seeded name, for the fake library. */
export const libraryExerciseNamed = (name: string) =>
  libraryExercise(slugOf(name), { name });

class FakeWorkoutBackend {
  profiles: ProfileRow[] = [];
  plans: SeedPlan[] = [];
  sessions: SessionRow[] = [];
  exercises: ExerciseRow[] = [];
  sets: SetRow[] = [];
  /** Every request received, in order. */
  requests: Request[] = [];
  /** Queries the fake cannot answer; a test bug, checked after each test. */
  unsupported: Error[] = [];
  inFlight = 0;
  private failures: Failure[] = [];
  private pauses: Array<Request & { resumed: Promise<void> }> = [];
  private nextId = 1;

  reset() {
    this.profiles = [];
    this.plans = [];
    this.sessions = [];
    this.exercises = [];
    this.sets = [];
    this.requests = [];
    this.unsupported = [];
    this.inFlight = 0;
    this.failures = [];
    this.pauses = [];
    this.nextId = 1;
  }

  id(prefix: string) {
    const id = `${prefix}-${this.nextId}`;
    this.nextId += 1;
    return id;
  }

  /**
   * Adds a session of plan `plan-1`; its exercises get ids `<session>-e<n>`
   * and their sets ids `<session>-e<n>-s<m>`, both counted from 1.
   */
  seed({ exercises, finished = false, id }: SeedSession) {
    this.sessions.push({
      finished_at: finished ? "2026-10-08T11:00:00.000Z" : null,
      id,
      plan_id: "plan-1",
      started_at: "2026-10-08T10:00:00.000Z",
      workout_id: `workout-of-${id}`,
      workoutName: `Workout ${id}`,
    });
    exercises.forEach(({ name, sets, slug }, exerciseIndex) => {
      const exerciseId = `${id}-e${exerciseIndex + 1}`;
      this.exercises.push({
        exercise_slug: slug ?? slugOf(name),
        id: exerciseId,
        order: exerciseIndex + 1,
        workout_session_id: id,
      });
      sets.forEach((reps, setIndex) => {
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
      });
    });
  }

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
  }

  profile(userId: string) {
    return this.profiles.find((profile) => profile.user_id === userId);
  }

  /** Adds a Plan; its Workout Exercises get ids `<workout>-e<n>`. */
  seedPlan(plan: SeedPlan) {
    this.plans.push(plan);
  }

  /** Makes the next matching request fail, as a lost connection would. */
  failNext(table: string, operation: Operation) {
    this.failures.push({
      error: new Error(`${operation} ${table} failed`),
      operation,
      table,
    });
  }

  /**
   * Holds matching requests unanswered until the returned function is
   * called, like a slow connection.
   */
  pause(table: string, operation: Operation) {
    let resume!: () => void;
    const resumed = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const pause = { operation, resumed, table };
    this.pauses.push(pause);
    return () => {
      this.pauses = this.pauses.filter((other) => other !== pause);
      resume();
    };
  }

  count(table: string, operation: Operation) {
    return this.requests.filter(
      (request) => request.table === table && request.operation === operation
    ).length;
  }

  session(id: string) {
    return this.sessions.find((session) => session.id === id);
  }

  async execute<T>(
    request: Request,
    handler: () => T
  ): Promise<{ data: T | null; error: Error | null }> {
    this.requests.push(request);
    this.inFlight += 1;
    try {
      // Answers on a later macrotask, like a network response.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await this.pauses.find(
        (pause) =>
          pause.table === request.table && pause.operation === request.operation
      )?.resumed;
      const failureIndex = this.failures.findIndex(
        (failure) =>
          failure.table === request.table &&
          failure.operation === request.operation
      );
      if (failureIndex >= 0) {
        const [failure] = this.failures.splice(failureIndex, 1);
        return { data: null, error: failure?.error ?? null };
      }
      return { data: clone(handler()), error: null };
    } catch (error) {
      this.unsupported.push(error as Error);
      throw error;
    } finally {
      this.inFlight -= 1;
    }
  }

  nestedPlan({ id, name, workouts }: SeedPlan) {
    return {
      id,
      name,
      workouts: workouts.map((workout, workoutIndex) => ({
        exercises: workout.exercises.map(({ sets, slug }, exerciseIndex) => ({
          exercise_slug: slug,
          id: `${workout.id}-e${exerciseIndex + 1}`,
          order: exerciseIndex + 1,
          sets: Array.from({ length: sets }, (_, setIndex) => ({
            id: `${workout.id}-e${exerciseIndex + 1}-s${setIndex + 1}`,
            order: setIndex + 1,
            reps_recommended: 10,
            rest_recommended: 90,
            weight_recommended: 0,
          })),
          workout_id: workout.id,
        })),
        id: workout.id,
        name: workout.name,
        order: workoutIndex + 1,
        plan_id: id,
        sessions: [],
      })),
    };
  }

  nestedExercise(row: ExerciseRow) {
    return {
      ...row,
      sets: this.sets.filter(
        (set) => set.workout_session_exercise_id === row.id
      ),
    };
  }

  nestedSession(row: SessionRow) {
    const { workoutName, ...session } = row;
    return {
      ...session,
      exercises: this.exercises
        .filter((exercise) => exercise.workout_session_id === row.id)
        .map((exercise) => this.nestedExercise(exercise)),
      workout: { id: row.workout_id, name: workoutName },
    };
  }
}

export const backend = new FakeWorkoutBackend();

type Filters = Record<string, unknown>;

const requireRow = <T>(row: T | undefined, what: string): T => {
  if (!row) {
    throw new Error(`Fake backend: no ${what}`);
  }
  return row;
};

/** A chainable query, run when awaited or on `single()`. */
class FakeQuery {
  private operation: Operation = "select";
  private values: Record<string, unknown> = {};
  private readonly filters: Filters = {};
  private readonly table: string;

  constructor(table: string) {
    this.table = table;
  }

  select() {
    return this;
  }

  insert(values: Record<string, unknown>) {
    this.operation = "insert";
    this.values = values;
    return this;
  }

  update(values: Record<string, unknown>) {
    this.operation = "update";
    this.values = values;
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters[column] = value;
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  maybeSingle() {
    return this.single();
  }

  single() {
    return backend.execute(
      { operation: this.operation, table: this.table },
      () => this.run()
    );
  }

  // biome-ignore lint/suspicious/noThenProperty: mirrors Supabase's awaitable query builder
  then<R1, R2 = never>(
    onFulfilled?: (value: { data: unknown; error: Error | null }) => R1,
    onRejected?: (reason: unknown) => R2
  ) {
    return this.single().then(onFulfilled, onRejected);
  }

  private run(): unknown {
    const key = `${this.table}.${this.operation}`;
    switch (key) {
      case "profiles.select":
        return backend.profile(this.filters.user_id as string) ?? null;
      case "plans.select":
        return backend.nestedPlan(
          requireRow(
            backend.plans.find(({ id }) => id === this.filters.id),
            "plan"
          )
        );
      case "workout_sessions.select":
        return backend.nestedSession(
          requireRow(backend.session(this.filters.id as string), "session")
        );
      case "workout_session_exercises.select":
        if (this.filters.exercise_slug) {
          // An Exercise's history, its session nested as the app selects it.
          return backend.exercises
            .filter(
              ({ exercise_slug }) =>
                exercise_slug === this.filters.exercise_slug
            )
            .map((row) => ({
              ...backend.nestedExercise(row),
              session: requireRow(
                backend.session(row.workout_session_id),
                "session"
              ),
            }));
        }
        return this.filters.id
          ? backend.nestedExercise(
              requireRow(
                backend.exercises.find(({ id }) => id === this.filters.id),
                "exercise"
              )
            )
          : backend.exercises
              .filter(
                (row) =>
                  row.workout_session_id === this.filters.workout_session_id
              )
              .sort((a, b) => b.order - a.order);
      case "workout_session_exercises.insert": {
        const row: ExerciseRow = {
          exercise_slug: this.values.exercise_slug as string,
          id: backend.id("added-exercise"),
          order: this.values.order as number,
          workout_session_id: this.values.workout_session_id as string,
        };
        backend.exercises.push(row);
        return backend.nestedExercise(row);
      }
      case "workout_session_exercises.update": {
        const row = requireRow(
          backend.exercises.find(({ id }) => id === this.filters.id),
          "exercise"
        );
        Object.assign(row, this.values);
        return backend.nestedExercise(row);
      }
      case "workout_session_exercises.delete":
        backend.sets = backend.sets.filter(
          (set) => set.workout_session_exercise_id !== this.filters.id
        );
        backend.exercises = backend.exercises.filter(
          ({ id }) => id !== this.filters.id
        );
        return null;
      case "workout_session_exercise_sets.select":
        return backend.sets
          .filter(
            (set) =>
              set.workout_session_exercise_id ===
              this.filters.workout_session_exercise_id
          )
          .sort((a, b) => b.order - a.order);
      case "workout_session_exercise_sets.insert": {
        const row: SetRow = {
          id: backend.id("added-set"),
          logged_at: null,
          order: 0,
          reps_completed: null,
          reps_recommended: null,
          rest_recommended: null,
          weight_completed: null,
          weight_recommended: null,
          workout_session_exercise_id: "",
          ...(this.values as Partial<SetRow>),
        };
        backend.sets.push(row);
        return row;
      }
      case "workout_session_exercise_sets.update": {
        if (this.filters.workout_session_exercise_id) {
          // Every set of an Exercise, as replacing it does.
          for (const set of backend.sets) {
            if (
              set.workout_session_exercise_id ===
              this.filters.workout_session_exercise_id
            ) {
              Object.assign(set, this.values);
            }
          }
          return null;
        }
        const row = requireRow(
          backend.sets.find(({ id }) => id === this.filters.id),
          "set"
        );
        Object.assign(row, this.values);
        return row;
      }
      default:
        throw new Error(`Fake backend: unsupported query ${key}`);
    }
  }
}

export const fakeSupabase = {
  from: (table: string) => new FakeQuery(table),
  rpc: (name: string, args: Record<string, unknown>) =>
    backend.execute({ operation: "rpc", table: name }, () => {
      if (name === "workout_session_plan_changes") {
        // The fake has no Plan, so no session ever changed one.
        requireRow(backend.session(args.session_id as string), "session");
        return { changes: [], plan: null, workout: null };
      }
      if (name !== "finish_workout_session") {
        throw new Error(`Fake backend: unsupported rpc ${name}`);
      }
      const session = requireRow(
        backend.session(args.p_session_id as string),
        "session"
      );
      session.finished_at = "2026-10-08T11:00:00.000Z";
      return null;
    }),
};
