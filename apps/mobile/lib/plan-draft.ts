import type { components } from "@fitme/api-client";
import {
  type ExperienceLevel,
  experienceLevels,
  type Goal,
  goals,
  MAX_EXERCISES_PER_WORKOUT,
  MAX_FREQUENCY,
  MAX_PLAN_NAME_LENGTH,
  MAX_PLAN_TEXT_LENGTH,
  MAX_REPS,
  MAX_REST_SECONDS,
  MAX_SETS_PER_EXERCISE,
  MAX_WEIGHT,
  MAX_WEIGHT_DECIMALS,
  MAX_WORKOUT_DURATION_MINUTES,
  MAX_WORKOUTS_PER_PLAN,
  MIN_FREQUENCY,
  type Place,
  places,
} from "@fitme/core";
import type { FullPlan, PlanWorkout } from "~/hooks/queries/plans";

/**
 * One planned set of the draft, with the id it was loaded under.
 *
 * Each target is `null` while its field holds something the write can't take
 * (empty, not a number, out of bounds), so Save can be disabled for it;
 * `isSavablePlanDraft` is what decides.
 */
/** One target of a set: what its field writes into the draft. */
export type DraftSetTarget = "reps" | "rest" | "weight";

/**
 * Each target's bounds, as `PUT /v1/plans/{id}` takes them: what a field
 * holds the User to, and what it names when they break it.
 */
export const SET_TARGET_BOUNDS = {
  reps: { max: MAX_REPS, min: 1 },
  rest: { max: MAX_REST_SECONDS, min: 0 },
  weight: { decimals: MAX_WEIGHT_DECIMALS, max: MAX_WEIGHT, min: 0 },
} as const;

export interface DraftSet {
  id?: string;
  /**
   * Its identity in the draft, for its React key: the id it was loaded
   * under, or a fresh one for a new set. Never sent.
   */
  key: string;
  reps: number | null;
  rest: number | null;
  weight: number | null;
}

/** One Exercise of a draft Workout, by its Exercise slug. */
export interface DraftExercise {
  exerciseSlug: string;
  id?: string;
  /**
   * Its identity in the draft: its React key, and what the picker replaces.
   * The id it was loaded under, or a fresh one for a new Exercise.
   */
  key: string;
  sets: DraftSet[];
}

/** One Workout of the draft, in rotation order. */
export interface DraftWorkout {
  /** Never shown: the editor sends it back as it was loaded. */
  description: string;
  exercises: DraftExercise[];
  id?: string;
  /**
   * Its identity in the draft: its React key, and the Workout editor's route
   * param. The id it was loaded under, or a fresh one for a new Workout.
   */
  key: string;
  name: string;
}

/**
 * The Plan the editor is working on: the Plan in full as it was loaded, ids
 * included, with every field the editor can change. It's held in memory for
 * one editor opening and never persisted (`hooks/plan-draft.ts`).
 *
 * A row's `id` is the one the Plan was read under, which the whole-Plan save
 * keeps (ADR 0016); a row without one is new. Its `key` is the draft's own
 * identity for it, which a new row has too, so a React key and a route
 * param survive a reorder. The four details are nullable, because a Plan may
 * leave them unset (ADR 0017), and the note is carried through unseen.
 *
 * `frequency` and `workoutDuration` hold what the User typed, out of bounds
 * included, so the editor can say what's wrong; `isSavablePlanDraft` is what
 * decides whether it can be saved.
 */
export interface PlanDraft {
  description: string;
  experienceLevel: ExperienceLevel | null;
  frequency: number | null;
  goal: Goal | null;
  name: string;
  note: string | null;
  place: Place | null;
  workoutDuration: number | null;
  workouts: DraftWorkout[];
}

/** A change to the draft, as the editor's store takes it. */
export type DraftChange = (change: (draft: PlanDraft) => PlanDraft) => void;

/** A set every target of which the whole-Plan save can take. */
export type SavableDraftSet = DraftSet & {
  reps: number;
  rest: number;
  weight: number;
};

/**
 * An Exercise with at least one savable set, as the write requires. The
 * narrowed list replaces the draft's rather than intersecting it: `.map`
 * over an intersection of two array types reads the first one's element.
 */
export type SavableDraftExercise = Omit<DraftExercise, "sets"> & {
  sets: SavableDraftSet[];
};

/** A Workout with at least one savable Exercise, as the write requires. */
export type SavableDraftWorkout = Omit<DraftWorkout, "exercises"> & {
  exercises: SavableDraftExercise[];
};

/**
 * A draft every required field of which is in bounds: what `savePlanBody`
 * takes, so a body never goes out with a detail or a target the write can't
 * express.
 */
export type SavablePlanDraft = Omit<PlanDraft, "workouts"> & {
  experienceLevel: ExperienceLevel;
  frequency: number;
  goal: Goal;
  place: Place;
  workoutDuration: number;
  workouts: SavableDraftWorkout[];
};

/** `PUT /v1/plans/{id}`'s body: the whole Plan, each row with its id. */
export type SavedPlanBody = components["schemas"]["SavedPlan"];

/** What a new Exercise's sets start at: 3 × 10 reps, bodyweight, 90 s rest. */
export const NEW_EXERCISE_SET_COUNT = 3;
const NEW_SET = { reps: 10, rest: 90, weight: 0 } as const;

let keys = 0;

/**
 * A fresh identity for a row the draft is adding. A loaded row takes its own
 * id instead, so building a draft from the same Plan twice gives the same
 * keys and `planDraftChanged` compares the two by value.
 */
const newDraftKey = (): string => {
  keys += 1;
  return `new-${keys}`;
};

/** One of `choices`, or `null` for a value the Plan doesn't have. */
const choice = <TChoice extends string>(
  choices: readonly TChoice[],
  value: string | null
): TChoice | null =>
  choices.includes(value as TChoice) ? (value as TChoice) : null;

const draftWorkout = (workout: PlanWorkout): DraftWorkout => ({
  description: workout.description,
  exercises: workout.exercises.map((exercise) => ({
    exerciseSlug: exercise.exercise_slug,
    id: exercise.id,
    key: exercise.id,
    sets: exercise.sets.map((set) => ({
      id: set.id,
      key: set.id,
      reps: set.reps_recommended,
      rest: set.rest_recommended,
      weight: set.weight_recommended,
    })),
  })),
  id: workout.id,
  key: workout.id,
  name: workout.name,
});

/**
 * The draft an edit starts from: the Plan in full as it was read, with its
 * Workouts in rotation order (the API answers them in it). A detail the API
 * doesn't know (or hasn't got) is unset rather than guessed.
 */
export const planDraftFrom = (plan: FullPlan): PlanDraft => ({
  description: plan.description ?? "",
  experienceLevel: choice(experienceLevels, plan.experience_level),
  frequency: plan.frequency,
  goal: choice(goals, plan.goal),
  name: plan.name ?? "",
  note: plan.note,
  place: choice(places, plan.place),
  workoutDuration: plan.workout_duration,
  workouts: plan.workouts.map(draftWorkout),
});

const isWholeNumberIn = (
  value: number | null,
  min: number,
  max: number
): value is number =>
  value !== null && Number.isInteger(value) && value >= min && value <= max;

/** Within 0.01 of a whole cent: a weight the write's numeric(8,2) can hold. */
const isStorableWeight = (value: number | null): value is number =>
  value !== null &&
  value >= 0 &&
  value <= MAX_WEIGHT &&
  Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

const isSavableName = (name: string) => {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= MAX_PLAN_NAME_LENGTH;
};

/**
 * Whether one target is one the write can take: what marks its field and,
 * when it can't, what disables Save. A value loaded out of bounds (a reps
 * target of 0, which the Plan Update can write) fails it like a typed one,
 * so the row always says why Save is off.
 */
export const isSavableTarget = (
  target: DraftSetTarget,
  value: number | null
): value is number => {
  if (target === "weight") {
    return isStorableWeight(value);
  }
  const { max, min } = SET_TARGET_BOUNDS[target];
  return isWholeNumberIn(value, min, max);
};

/** Whether a set's three targets are all in the write's bounds. */
export const isSavableSet = (set: DraftSet): set is SavableDraftSet =>
  isSavableTarget("reps", set.reps) &&
  isSavableTarget("rest", set.rest) &&
  isSavableTarget("weight", set.weight);

/** Whether an Exercise has at least one set and every set is savable. */
const isSavableExercise = (
  exercise: DraftExercise
): exercise is SavableDraftExercise =>
  exercise.sets.length >= 1 && exercise.sets.every(isSavableSet);

/**
 * Whether a Workout can be saved: a name, at least one Exercise, and every
 * Exercise with savable sets. It's what the Plan editor's row says is wrong.
 */
export const isSavableWorkout = (
  workout: DraftWorkout
): workout is SavableDraftWorkout =>
  isSavableName(workout.name) &&
  workout.exercises.length >= 1 &&
  workout.exercises.every(isSavableExercise);

/**
 * Whether the draft can be saved: a name and a frequency within
 * `@fitme/core`'s bounds, a Workout duration within its own, at least one
 * Workout, every Workout savable (a name, an Exercise, and every set's
 * targets in bounds), and each of the four details set, since the whole-Plan
 * save still requires them (clearing one comes with the migration, ADR
 * 0017). It's what Save is enabled by.
 */
export const isSavablePlanDraft = (
  draft: PlanDraft
): draft is SavablePlanDraft =>
  isSavableName(draft.name) &&
  draft.description.length <= MAX_PLAN_TEXT_LENGTH &&
  isWholeNumberIn(draft.frequency, MIN_FREQUENCY, MAX_FREQUENCY) &&
  isWholeNumberIn(draft.workoutDuration, 1, MAX_WORKOUT_DURATION_MINUTES) &&
  draft.goal !== null &&
  draft.place !== null &&
  draft.experienceLevel !== null &&
  draft.workouts.length >= 1 &&
  draft.workouts.every(isSavableWorkout);

/** A text field the write leaves out when there's nothing in it. */
const textOrNothing = (value: string) => {
  const trimmed = value.trim();
  return trimmed === "" ? {} : { description: trimmed };
};

/**
 * The body `PUT /v1/plans/{id}` takes, field by field: the write's schema is
 * strict, so nothing the read carries along (`order`, `cover`, `plan_id`,
 * the timestamps) and nothing the draft holds for itself (`key`) may go
 * back. Every row sent with its id keeps it, and an empty description is
 * left out, which clears it.
 */
export const savePlanBody = (draft: SavablePlanDraft): SavedPlanBody => ({
  ...textOrNothing(draft.description),
  experience_level: draft.experienceLevel,
  frequency: draft.frequency,
  goal: draft.goal,
  name: draft.name.trim(),
  note: draft.note,
  place: draft.place,
  workout_duration: draft.workoutDuration,
  workouts: draft.workouts.map((workout) => ({
    ...textOrNothing(workout.description),
    exercises: workout.exercises.map((exercise) => ({
      exercise_slug: exercise.exerciseSlug,
      ...(exercise.id === undefined ? {} : { id: exercise.id }),
      sets: exercise.sets.map((set) => ({
        ...(set.id === undefined ? {} : { id: set.id }),
        reps_recommended: set.reps,
        rest_recommended: set.rest,
        weight_recommended: set.weight,
      })),
    })),
    ...(workout.id === undefined ? {} : { id: workout.id }),
    name: workout.name.trim(),
  })),
});

/**
 * The id the save gave each row it created, by the key that row was sent
 * under. The answer carries the Plan exactly as the body sent it — Workouts
 * in rotation order, each one's Exercises and sets in theirs — so the two
 * are walked in lockstep; a list the answer doesn't match is left alone
 * rather than guessed at.
 */
const savedIdsByKey = (
  sent: PlanDraft,
  saved: FullPlan
): Map<string, string> => {
  const ids = new Map<string, string>();
  if (saved.workouts.length !== sent.workouts.length) {
    return ids;
  }
  sent.workouts.forEach((workout, at) => {
    const savedWorkout = saved.workouts[at];
    ids.set(workout.key, savedWorkout.id);
    if (savedWorkout.exercises.length !== workout.exercises.length) {
      return;
    }
    workout.exercises.forEach((exercise, index) => {
      const savedExercise = savedWorkout.exercises[index];
      ids.set(exercise.key, savedExercise.id);
      if (savedExercise.sets.length !== exercise.sets.length) {
        return;
      }
      exercise.sets.forEach((set, position) => {
        ids.set(set.key, savedExercise.sets[position].id);
      });
    });
  });
  return ids;
};

/** That row with the id the save gave it, or as it is when it had one. */
const withSavedId = <TRow extends { id?: string; key: string }>(
  row: TRow,
  ids: Map<string, string>
): TRow => {
  const id = row.id ?? ids.get(row.key);
  return id === row.id ? row : { ...row, id };
};

/**
 * The draft with the ids the save gave the rows it created, so the next Save
 * updates those rows in place instead of sending them with no id again —
 * which the whole-Plan save reads as "deleted, and a new one added",
 * replacing a Workout's Cover and cutting its Workout Sessions loose.
 *
 * It matches by the draft's own `key`, not by position, so edits made while
 * the save was in flight (a reorder, a removal, another new row) keep what
 * they are: a row the draft no longer has is dropped, and one added since
 * stays new.
 */
export const adoptSavedIds = (
  draft: PlanDraft,
  sent: PlanDraft,
  saved: FullPlan
): PlanDraft => {
  const ids = savedIdsByKey(sent, saved);
  if (ids.size === 0) {
    return draft;
  }
  return {
    ...draft,
    workouts: draft.workouts.map((workout) => ({
      ...withSavedId(workout, ids),
      exercises: workout.exercises.map((exercise) => ({
        ...withSavedId(exercise, ids),
        sets: exercise.sets.map((set) => withSavedId(set, ids)),
      })),
    })),
  };
};

/** The draft with the Workout at `index` moved by `by` (-1 up, 1 down). */
export const moveDraftWorkout = (
  draft: PlanDraft,
  index: number,
  by: -1 | 1
): PlanDraft => {
  const to = index + by;
  if (to < 0 || to >= draft.workouts.length) {
    return draft;
  }
  const workouts = [...draft.workouts];
  const [moved] = workouts.splice(index, 1);
  workouts.splice(to, 0, moved);
  return { ...draft, workouts };
};

/** The draft without the Workout at `index`. */
export const removeDraftWorkout = (
  draft: PlanDraft,
  index: number
): PlanDraft => ({
  ...draft,
  workouts: draft.workouts.filter((_workout, at) => at !== index),
});

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * What a Workout added now is called: the letter of its place in the
 * rotation (the fourth is "Workout D"), moved on to the next letter while a
 * Workout of the draft already goes by that name, so no two read the same.
 * `nameFor` is the catalog's name for a letter, so this reads in the App
 * language.
 */
export const nextWorkoutName = (
  workouts: readonly DraftWorkout[],
  nameFor: (letter: string) => string
): string => {
  const taken = new Set(workouts.map((workout) => workout.name.trim()));
  const from = workouts.length % LETTERS.length;
  const letters = Array.from(
    { length: LETTERS.length },
    (_letter, at) => LETTERS[(from + at) % LETTERS.length]
  );
  const free = letters.find((letter) => !taken.has(nameFor(letter)));
  return nameFor(free ?? LETTERS[from]);
};

/** Whether another Workout fits the Plan (`@fitme/core`'s cap). */
export const canAddDraftWorkout = (draft: PlanDraft) =>
  draft.workouts.length < MAX_WORKOUTS_PER_PLAN;

/**
 * The draft with a new, empty Workout named `name` at the end of the
 * rotation, and its key, so the caller can open it. The Plan's cap is the
 * caller's to check (`canAddDraftWorkout` disables Add).
 */
export const addDraftWorkout = (
  draft: PlanDraft,
  name: string
): { draft: PlanDraft; key: string } => {
  const workout: DraftWorkout = {
    description: "",
    exercises: [],
    key: newDraftKey(),
    name,
  };
  return {
    draft: { ...draft, workouts: [...draft.workouts, workout] },
    key: workout.key,
  };
};

/** The Workout of the draft with that key, or `undefined` once it's gone. */
export const draftWorkoutByKey = (
  draft: PlanDraft,
  key: string
): DraftWorkout | undefined =>
  draft.workouts.find((workout) => workout.key === key);

/** The draft with `change` applied to the Workout with that key. */
const changeWorkout = (
  draft: PlanDraft,
  key: string,
  change: (workout: DraftWorkout) => DraftWorkout
): PlanDraft => ({
  ...draft,
  workouts: draft.workouts.map((workout) =>
    workout.key === key ? change(workout) : workout
  ),
});

/** The draft with the Workout renamed. */
export const renameDraftWorkout = (
  draft: PlanDraft,
  key: string,
  name: string
): PlanDraft => changeWorkout(draft, key, (workout) => ({ ...workout, name }));

/** Whether another Exercise fits the Workout (`@fitme/core`'s cap). */
export const canAddDraftExercise = (workout: DraftWorkout) =>
  workout.exercises.length < MAX_EXERCISES_PER_WORKOUT;

const newSet = (): DraftSet => ({ ...NEW_SET, key: newDraftKey() });

/**
 * The draft with the Exercise appended to the Workout, at
 * `NEW_EXERCISE_SET_COUNT` sets of 10 reps, no weight and 90 s rest, so only
 * what the User wants different is theirs to change.
 */
export const addDraftExercise = (
  draft: PlanDraft,
  workoutKey: string,
  exerciseSlug: string
): PlanDraft =>
  changeWorkout(draft, workoutKey, (workout) => ({
    ...workout,
    exercises: [
      ...workout.exercises,
      {
        exerciseSlug,
        key: newDraftKey(),
        sets: Array.from({ length: NEW_EXERCISE_SET_COUNT }, newSet),
      },
    ],
  }));

/**
 * The draft with the Exercise swapped for another in place: the row, its id
 * and its set rows stay, so swapping a movement doesn't mean retyping the
 * sets.
 */
export const replaceDraftExercise = (
  draft: PlanDraft,
  workoutKey: string,
  exerciseKey: string,
  exerciseSlug: string
): PlanDraft =>
  changeWorkout(draft, workoutKey, (workout) => ({
    ...workout,
    exercises: workout.exercises.map((exercise) =>
      exercise.key === exerciseKey ? { ...exercise, exerciseSlug } : exercise
    ),
  }));

/** The draft without that Exercise, its sets with it. */
export const removeDraftExercise = (
  draft: PlanDraft,
  workoutKey: string,
  exerciseKey: string
): PlanDraft =>
  changeWorkout(draft, workoutKey, (workout) => ({
    ...workout,
    exercises: workout.exercises.filter(
      (exercise) => exercise.key !== exerciseKey
    ),
  }));

/** The draft with that Exercise moved by `by` (-1 up, 1 down). */
export const moveDraftExercise = (
  draft: PlanDraft,
  workoutKey: string,
  exerciseKey: string,
  by: -1 | 1
): PlanDraft =>
  changeWorkout(draft, workoutKey, (workout) => {
    const index = workout.exercises.findIndex(
      (exercise) => exercise.key === exerciseKey
    );
    const to = index + by;
    if (index < 0 || to < 0 || to >= workout.exercises.length) {
      return workout;
    }
    const exercises = [...workout.exercises];
    const [moved] = exercises.splice(index, 1);
    exercises.splice(to, 0, moved);
    return { ...workout, exercises };
  });

/** Whether another set fits the Exercise (`@fitme/core`'s cap). */
export const canAddDraftSet = (exercise: DraftExercise) =>
  exercise.sets.length < MAX_SETS_PER_EXERCISE;

/** The draft with `change` applied to that Exercise. */
const changeExercise = (
  draft: PlanDraft,
  workoutKey: string,
  exerciseKey: string,
  change: (exercise: DraftExercise) => DraftExercise
): PlanDraft =>
  changeWorkout(draft, workoutKey, (workout) => ({
    ...workout,
    exercises: workout.exercises.map((exercise) =>
      exercise.key === exerciseKey ? change(exercise) : exercise
    ),
  }));

/**
 * The draft with a set appended to that Exercise, copying the one before it
 * (its id left behind, so it's a new set), or the defaults when it has none.
 */
export const addDraftSet = (
  draft: PlanDraft,
  workoutKey: string,
  exerciseKey: string
): PlanDraft =>
  changeExercise(draft, workoutKey, exerciseKey, (exercise) => {
    const previous = exercise.sets.at(-1);
    const added: DraftSet = previous
      ? {
          key: newDraftKey(),
          reps: previous.reps,
          rest: previous.rest,
          weight: previous.weight,
        }
      : newSet();
    return { ...exercise, sets: [...exercise.sets, added] };
  });

/** The draft without that set. */
export const removeDraftSet = (
  draft: PlanDraft,
  workoutKey: string,
  exerciseKey: string,
  setKey: string
): PlanDraft =>
  changeExercise(draft, workoutKey, exerciseKey, (exercise) => ({
    ...exercise,
    sets: exercise.sets.filter((set) => set.key !== setKey),
  }));

/** The draft with one of that set's targets changed. */
export const updateDraftSet = (
  draft: PlanDraft,
  workoutKey: string,
  exerciseKey: string,
  setKey: string,
  target: DraftSetTarget,
  value: number | null
): PlanDraft =>
  changeExercise(draft, workoutKey, exerciseKey, (exercise) => ({
    ...exercise,
    sets: exercise.sets.map((set) =>
      set.key === setKey ? { ...set, [target]: value } : set
    ),
  }));

/**
 * Whether the draft differs from the one the editor opened on: what decides
 * whether leaving asks first. Every draft is built by `planDraftFrom` and
 * changed by spreading it, so the two always have their fields in the same
 * order and comparing them as JSON compares their values.
 */
export const planDraftChanged = (loaded: PlanDraft, draft: PlanDraft) =>
  JSON.stringify(loaded) !== JSON.stringify(draft);
