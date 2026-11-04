import type { components } from "@fitme/api-client";
import {
  type ExperienceLevel,
  experienceLevels,
  type Goal,
  goals,
  MAX_FREQUENCY,
  MAX_PLAN_NAME_LENGTH,
  MAX_PLAN_TEXT_LENGTH,
  MAX_WORKOUT_DURATION_MINUTES,
  MIN_FREQUENCY,
  type Place,
  places,
} from "@fitme/core";
import type { FullPlan, PlanWorkout } from "~/hooks/queries/plans";

/** One planned set of the draft, with the id it was loaded under. */
export interface DraftSet {
  id?: string;
  reps: number;
  rest: number;
  weight: number;
}

/** One Exercise of a draft Workout, by its Exercise slug. */
export interface DraftExercise {
  exerciseSlug: string;
  id?: string;
  sets: DraftSet[];
}

/** One Workout of the draft, in rotation order. */
export interface DraftWorkout {
  /** Never shown: the editor sends it back as it was loaded. */
  description: string;
  exercises: DraftExercise[];
  id?: string;
  name: string;
}

/**
 * The Plan the editor is working on: the Plan in full as it was loaded, ids
 * included, with every field the editor can change. It's held in memory for
 * one editor opening and never persisted (`hooks/plan-draft.ts`).
 *
 * A row's `id` is the one the Plan was read under, which the whole-Plan save
 * keeps (ADR 0016); a row without one is new. The four details are nullable,
 * because a Plan may leave them unset (ADR 0017), and the note is carried
 * through unseen.
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

/**
 * A draft every required field of which is in bounds: what `savePlanBody`
 * takes, so a body never goes out with a detail the write can't express.
 */
export type SavablePlanDraft = PlanDraft & {
  experienceLevel: ExperienceLevel;
  frequency: number;
  goal: Goal;
  place: Place;
  workoutDuration: number;
};

/** `PUT /v1/plans/{id}`'s body: the whole Plan, each row with its id. */
export type SavedPlanBody = components["schemas"]["SavedPlan"];

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
    sets: exercise.sets.map((set) => ({
      id: set.id,
      reps: set.reps_recommended,
      rest: set.rest_recommended,
      weight: set.weight_recommended,
    })),
  })),
  id: workout.id,
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

const isSavableName = (name: string) => {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= MAX_PLAN_NAME_LENGTH;
};

/**
 * Whether the draft can be saved: a name and a frequency within
 * `@fitme/core`'s bounds, a Workout duration within its own, at least one
 * Workout, every Workout with at least one Exercise, and each of the four
 * details set, since the whole-Plan save still requires them (clearing one
 * comes with the migration, ADR 0017). It's what Save is enabled by.
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
  draft.workouts.every(
    (workout) =>
      workout.name.trim().length >= 1 && workout.exercises.length >= 1
  );

/** A text field the write leaves out when there's nothing in it. */
const textOrNothing = (value: string) => {
  const trimmed = value.trim();
  return trimmed === "" ? {} : { description: trimmed };
};

/**
 * The body `PUT /v1/plans/{id}` takes, field by field: the write's schema is
 * strict, so nothing the read carries along (`order`, `cover`, `plan_id`,
 * the timestamps) may go back. Every row sent with its id keeps it, and an
 * empty description is left out, which clears it.
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

/**
 * Whether the draft differs from the one the editor opened on: what decides
 * whether leaving asks first. Every draft is built by `planDraftFrom` and
 * changed by spreading it, so the two always have their fields in the same
 * order and comparing them as JSON compares their values.
 */
export const planDraftChanged = (loaded: PlanDraft, draft: PlanDraft) =>
  JSON.stringify(loaded) !== JSON.stringify(draft);
