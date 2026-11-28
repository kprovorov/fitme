import {
  MAX_EXERCISES_PER_WORKOUT,
  MAX_FREQUENCY,
  MAX_PLAN_NAME_LENGTH,
  MAX_PLAN_TEXT_LENGTH,
  MAX_SETS_PER_EXERCISE,
  MAX_WEIGHT_DECIMALS,
  MAX_WORKOUT_DURATION_MINUTES,
  MAX_WORKOUTS_PER_PLAN,
  MIN_FREQUENCY,
} from "@fitme/core/limits";
import { experienceLevels, goals, places } from "@fitme/core/models";
import { asUser } from "@fitme/db";
import { planVersion } from "@fitme/services/plan-proposals";
import type {
  PlanProposal,
  PlanProposalChanges,
} from "@fitme/services/plan-proposals";
import { getPlan } from "@fitme/services/plans";
import type { NewPlan, PlanDetail } from "@fitme/services/plans";
import { z } from "zod";

import { checkExerciseSlugs, exerciseSlugSchema } from "./exercises";
import { getLibraryIndex } from "./library-index";
import { setSchema } from "./workout-edits";

const WEIGHT_SCALE = 10 ** MAX_WEIGHT_DECIMALS;

/** A weight in hundredths, as numeric(8,2) stores it. */
const hundredths = (weight: number) => Math.round(weight * WEIGHT_SCALE);

const rowId = (row: string) =>
  z
    .guid()
    .optional()
    .describe(
      `The ${row}'s id as get_plan or get_active_plan answered it; leave it out for a new ${row}`
    );

const proposedSetSchema = setSchema.extend({
  id: rowId("set"),
  weight_recommended: setSchema.shape.weight_recommended
    .refine(
      (weight) => Math.abs(weight * WEIGHT_SCALE - hundredths(weight)) < 1e-6,
      `At most ${MAX_WEIGHT_DECIMALS} decimals`
    )
    .nullable()
    .describe(
      "Recommended weight in the user's unit (0 for bodyweight). In a new plan, null when the user has no history of the exercise to take one from: never invent a load. A change to a plan always sends a number"
    ),
});

const proposedExerciseSchema = z.object({
  exercise_slug: exerciseSlugSchema.describe(
    "The exercise_slug as get_plan answered it, or one search_exercises returned for a new or replacing exercise"
  ),
  id: rowId("workout exercise"),
  sets: z
    .array(proposedSetSchema)
    .min(1)
    .max(MAX_SETS_PER_EXERCISE)
    .describe("Every set of the exercise, in the order they are performed"),
});

const proposedWorkoutSchema = z.object({
  description: z
    .string()
    .max(MAX_PLAN_TEXT_LENGTH)
    .describe(
      "The workout's description as read, or the new one; empty for none"
    ),
  exercises: z
    .array(proposedExerciseSchema)
    .min(1)
    .max(MAX_EXERCISES_PER_WORKOUT)
    .describe("Every exercise of the workout, in the order they are performed"),
  id: rowId("workout"),
  name: z.string().trim().min(1).max(MAX_PLAN_NAME_LENGTH),
});

/** The Plan details a proposal changes; one left out stays as it is. */
const proposedDetailsSchema = z.object({
  description: z.string().max(MAX_PLAN_TEXT_LENGTH).optional(),
  experience_level: z
    .enum(experienceLevels)
    .nullable()
    .optional()
    .describe("null clears it"),
  frequency: z
    .number()
    .int()
    .min(MIN_FREQUENCY)
    .max(MAX_FREQUENCY)
    .optional()
    .describe("Workouts a week"),
  goal: z.enum(goals).nullable().optional().describe("null clears it"),
  name: z.string().trim().min(1).max(MAX_PLAN_NAME_LENGTH).optional(),
  note: z
    .string()
    .max(MAX_PLAN_TEXT_LENGTH)
    .nullable()
    .optional()
    .describe("null clears it"),
  place: z.enum(places).nullable().optional().describe("null clears it"),
  workout_duration: z
    .number()
    .int()
    .min(1)
    .max(MAX_WORKOUT_DURATION_MINUTES)
    .nullable()
    .optional()
    .describe("Minutes; null clears it"),
});

/**
 * `propose_plan`'s input: what changes in one of the User's Plans, or, with
 * no `plan_id`, a whole new Plan.
 */
export const planProposalInputSchema = z.object({
  details: proposedDetailsSchema
    .optional()
    .describe(
      "For a change, only the plan details that change. For a new plan, its details: name and frequency required, the rest optional"
    ),
  plan_id: z
    .guid()
    .optional()
    .describe("The id of the plan to change; leave it out for a new plan"),
  plan_version: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .optional()
    .describe(
      "The plan_version get_plan or get_active_plan answered with the plan you're changing; leave it out for a new plan"
    ),
  removed_workout_ids: z
    .array(z.guid())
    .max(MAX_WORKOUTS_PER_PLAN)
    .optional()
    .describe("The ids of the workouts to remove from the plan"),
  workouts: z
    .array(proposedWorkoutSchema)
    .max(MAX_WORKOUTS_PER_PLAN)
    .optional()
    .describe(
      "For a change, each changed workout in full, with every exercise and set it keeps, and new workouts without an id; workouts left out stay as they are. For a new plan, every workout in rotation order, no ids"
    ),
});

export type PlanProposalInput = z.infer<typeof planProposalInputSchema>;

/** A note as the proposal saves it: an empty one is no note. */
const noteOf = (note: string | null | undefined) => (note === "" ? null : note);

/** Whether the proposal is a whole new Plan rather than a change to one. */
export const isNewPlan = (input: PlanProposalInput): boolean =>
  input.plan_id === undefined;

type ProposedWorkout = NonNullable<PlanProposalInput["workouts"]>[number];

/**
 * The Workouts with every weight a number: a Plan set always has a weight
 * target, and one left empty (no history to take it from) is saved as none,
 * 0, as the Plan builder saves a set with no weight.
 */
const weighedWorkouts = (workouts: readonly ProposedWorkout[]) =>
  workouts.map((workout) => ({
    ...workout,
    exercises: workout.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({
        ...set,
        weight_recommended: set.weight_recommended ?? 0,
      })),
    })),
  }));

/** The input as the Plan Proposal save takes it (a change, checked first). */
export const toPlanProposal = (input: PlanProposalInput): PlanProposal => ({
  details:
    input.details === undefined
      ? undefined
      : { ...input.details, note: noteOf(input.details.note) },
  planVersion: input.plan_version ?? "",
  removedWorkoutIds: input.removed_workout_ids,
  workouts:
    input.workouts === undefined ? undefined : weighedWorkouts(input.workouts),
});

/**
 * A new Plan's input as `createPlan` takes it, each Workout with the Cover
 * picked for it. Throws without a name or a frequency, which the check
 * refuses first.
 */
export const toNewPlan = (
  input: PlanProposalInput,
  covers: readonly (string | null)[]
): NewPlan => {
  const details = input.details ?? {};
  const { frequency, name } = details;

  // Never a default: a Plan without either is refused, not made up
  if (name === undefined || frequency === undefined) {
    throw new Error(
      "Nothing was saved: a new plan needs details.name and details.frequency."
    );
  }

  return {
    description: details.description ?? "",
    experience_level: details.experience_level ?? null,
    frequency,
    goal: details.goal ?? null,
    name,
    note: noteOf(details.note) ?? null,
    place: details.place ?? null,
    workout_duration: details.workout_duration ?? null,
    workouts: weighedWorkouts(input.workouts ?? []).map((workout, index) => ({
      cover: covers[index] ?? null,
      description: workout.description,
      exercises: workout.exercises.map((exercise) => ({
        exercise_slug: exercise.exercise_slug,
        sets: exercise.sets.map((set) => ({
          reps_recommended: set.reps_recommended,
          rest_recommended: set.rest_recommended,
          weight_recommended: set.weight_recommended,
        })),
      })),
      name: workout.name,
    })),
  };
};

/** What a new Plan adds, counted as a change's counts are. */
export const newPlanChanges = (
  input: PlanProposalInput
): PlanProposalChanges => {
  const workouts = input.workouts ?? [];
  const exercises = workouts.flatMap((workout) => workout.exercises);

  return {
    exercisesAdded: exercises.length,
    exercisesRemoved: 0,
    setsAdded: exercises.reduce(
      (count, exercise) => count + exercise.sets.length,
      0
    ),
    setsChanged: 0,
    setsRemoved: 0,
    workoutsAdded: workouts.length,
    workoutsChanged: 0,
    workoutsRemoved: 0,
  };
};

/** The save's counts, as the tool answers them. */
export const shownChanges = (changes: PlanProposalChanges) => ({
  exercises_added: changes.exercisesAdded,
  exercises_removed: changes.exercisesRemoved,
  sets_added: changes.setsAdded,
  sets_changed: changes.setsChanged,
  sets_removed: changes.setsRemoved,
  workouts_added: changes.workoutsAdded,
  workouts_changed: changes.workoutsChanged,
  workouts_removed: changes.workoutsRemoved,
});

/** What the model is told when the Plan moved on since it was read. */
export const PLAN_CHANGED =
  "The plan changed since you read it (the user trained, edited it or took a plan update), so nothing was saved. Read it again with get_plan and propose the change afresh from what it is now.";

/** Every input problem, each with the field it's in, for the model to fix. */
const inputProblems = (error: z.ZodError) =>
  error.issues
    .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
    .join("; ");

const lowercase = (id: string) => id.toLowerCase();

/**
 * The ids the proposal sends that aren't this Plan's rows under the parent
 * they're sent under, or are sent more than once.
 */
const foreignIds = (plan: PlanDetail, input: PlanProposalInput): string[] => {
  const workoutIds = new Set(plan.workouts.map((workout) => workout.id));
  const exerciseParent = new Map<string, string>();
  const setParent = new Map<string, string>();

  for (const workout of plan.workouts) {
    for (const exercise of workout.exercises) {
      exerciseParent.set(exercise.id, workout.id);

      for (const set of exercise.sets) {
        setParent.set(set.id, exercise.id);
      }
    }
  }

  const seen = new Set<string>();
  const foreign = new Set<string>();

  const check = (id: string, belongs: boolean) => {
    const key = lowercase(id);

    if (!belongs || seen.has(key)) {
      foreign.add(id);
    }

    seen.add(key);
  };

  for (const workout of input.workouts ?? []) {
    const workoutId =
      workout.id === undefined ? undefined : lowercase(workout.id);

    if (workout.id !== undefined && workoutId !== undefined) {
      check(workout.id, workoutIds.has(workoutId));
    }

    for (const exercise of workout.exercises) {
      const exerciseId =
        exercise.id === undefined ? undefined : lowercase(exercise.id);

      if (exercise.id !== undefined && exerciseId !== undefined) {
        check(
          exercise.id,
          workoutId !== undefined &&
            exerciseParent.get(exerciseId) === workoutId
        );
      }

      for (const set of exercise.sets) {
        if (set.id !== undefined) {
          check(
            set.id,
            exerciseId !== undefined &&
              setParent.get(lowercase(set.id)) === exerciseId
          );
        }
      }
    }
  }

  for (const id of input.removed_workout_ids ?? []) {
    check(id, workoutIds.has(lowercase(id)));
  }

  return [...foreign];
};

/** The Plan details as a proposal compares them, an unset one as `null`. */
const readDetails = (plan: PlanDetail) => ({
  description: plan.description ?? "",
  experience_level: plan.experience_level ?? null,
  frequency: plan.frequency,
  goal: plan.goal ?? null,
  name: plan.name,
  note: plan.note ?? null,
  place: plan.place ?? null,
  workout_duration: plan.workout_duration ?? null,
});

const DETAIL_KEYS = [
  "description",
  "experience_level",
  "frequency",
  "goal",
  "name",
  "note",
  "place",
  "workout_duration",
] as const satisfies readonly (keyof ReturnType<typeof readDetails>)[];

/** Whether a detail the proposal sends differs from the Plan's. */
const changesDetails = (
  plan: PlanDetail,
  details: NonNullable<PlanProposalInput["details"]>
): boolean => {
  const read = readDetails(plan);

  const sent = { ...details, note: noteOf(details.note) };

  return DETAIL_KEYS.some(
    (key) => sent[key] !== undefined && sent[key] !== read[key]
  );
};

/** Whether saving the proposal would change anything in the Plan. */
const changesPlan = (plan: PlanDetail, input: PlanProposalInput): boolean => {
  if (
    (input.removed_workout_ids ?? []).length > 0 ||
    changesDetails(plan, input.details ?? {})
  ) {
    return true;
  }

  const read = new Map(plan.workouts.map((workout) => [workout.id, workout]));

  return (input.workouts ?? []).some((workout) => {
    const kept =
      workout.id === undefined ? undefined : read.get(lowercase(workout.id));

    if (kept === undefined) {
      return true;
    }

    const shape = (w: {
      description: string;
      exercises: readonly {
        exercise_slug: string;
        id?: string;
        sets: readonly {
          id?: string;
          reps_recommended: number;
          rest_recommended: number;
          weight_recommended: number | null;
        }[];
      }[];
      name: string;
    }) =>
      JSON.stringify([
        w.name,
        w.description,
        w.exercises.map((exercise) => [
          exercise.id === undefined ? null : lowercase(exercise.id),
          exercise.exercise_slug,
          exercise.sets.map((set) => [
            set.id === undefined ? null : lowercase(set.id),
            set.reps_recommended,
            set.rest_recommended,
            hundredths(set.weight_recommended ?? 0),
          ]),
        ]),
      ]);

    return shape(kept) !== shape(workout);
  });
};

/**
 * The checks against the Plan as read: still the version Arnold read, every
 * row id its own under the parent it was sent under, at least one and at
 * most the bound of Workouts left, and something that changes.
 */
const checkAgainstPlan = (
  plan: PlanDetail,
  input: PlanProposalInput
): string | null => {
  if (planVersion(plan) !== input.plan_version) {
    return PLAN_CHANGED;
  }

  const foreign = foreignIds(plan, input);

  if (foreign.length > 0) {
    return `These ids aren't rows of this plan under the workout or exercise they were sent under, or are sent twice: ${foreign.join(", ")}. Keep each row under the id get_plan answered it with, leave the id out for a new row, and propose again.`;
  }

  const newWorkouts = (input.workouts ?? []).filter(
    (workout) => workout.id === undefined
  ).length;

  const remaining =
    plan.workouts.length -
    (input.removed_workout_ids ?? []).length +
    newWorkouts;

  if (remaining < 1) {
    return "The proposal would leave the plan without a workout. Keep at least one, or propose a new plan instead.";
  }

  if (remaining > MAX_WORKOUTS_PER_PLAN) {
    return `The proposal would leave the plan with ${remaining} workouts; a plan has at most ${MAX_WORKOUTS_PER_PLAN}.`;
  }

  if (!changesPlan(plan, input)) {
    return "The proposal changes nothing in the plan as it is: every workout and detail sent is what get_plan answered. Send only what changes.";
  }

  return null;
};

/**
 * The slugs the proposal brings in: every Exercise's but a kept one's still
 * under the slug it was read with, so an untouched Exercise whose slug left
 * the Library never refuses a change to another.
 */
const changedSlugs = (plan: PlanDetail, input: PlanProposalInput): string[] => {
  const readSlugs = new Map(
    plan.workouts.flatMap((workout) =>
      workout.exercises.map((exercise) => [exercise.id, exercise.exercise_slug])
    )
  );

  return (input.workouts ?? []).flatMap((workout) =>
    workout.exercises.flatMap((exercise) =>
      exercise.id !== undefined &&
      readSlugs.get(lowercase(exercise.id)) === exercise.exercise_slug
        ? []
        : [exercise.exercise_slug]
    )
  );
};

const LIBRARY_INDEX_UNAVAILABLE =
  "The exercise library is unavailable right now, so the proposal wasn't shown. Try again in a moment.";

/** The ids a new Plan's rows carry, none of which a new row has. */
const sentRowIds = (input: PlanProposalInput): string[] =>
  (input.workouts ?? []).flatMap((workout) => [
    ...(workout.id === undefined ? [] : [workout.id]),
    ...workout.exercises.flatMap((exercise) => [
      ...(exercise.id === undefined ? [] : [exercise.id]),
      ...exercise.sets.flatMap((set) => (set.id === undefined ? [] : [set.id])),
    ]),
  ]);

/**
 * Checks a proposal of a whole new Plan: no marker, removal or row id (there
 * is no Plan to have them), a name, a frequency and at least one Workout
 * (the schema already holds each Workout to an Exercise and each Exercise to
 * a set), every slug against the new Library, and that the Library index can
 * load for the Workouts' Covers.
 */
const checkNewPlan = async (
  input: PlanProposalInput
): Promise<string | null> => {
  if (
    input.plan_version !== undefined ||
    (input.removed_workout_ids ?? []).length > 0
  ) {
    return "A new plan has no plan_version or removed_workout_ids. To change an existing plan, pass its plan_id with them; for a new one, leave all three out.";
  }

  const ids = sentRowIds(input);

  if (ids.length > 0) {
    return `A new plan's workouts, exercises and sets have no ids, but these were sent: ${ids.join(", ")}. Leave every id out, or pass the plan_id of the plan they belong to.`;
  }

  const missing = [
    ...(input.details?.name === undefined ? ["details.name"] : []),
    ...(input.details?.frequency === undefined ? ["details.frequency"] : []),
  ];

  if (missing.length > 0) {
    return `A new plan needs ${missing.join(" and ")}. Add them and propose again.`;
  }

  const workouts = input.workouts ?? [];

  if (workouts.length === 0) {
    return "A new plan needs at least one workout, each with its exercises and sets. Add them and propose again.";
  }

  const unknown = await checkExerciseSlugs(
    workouts.flatMap((workout) =>
      workout.exercises.map((exercise) => exercise.exercise_slug)
    )
  );

  if (unknown) {
    return unknown.error;
  }

  const index = await getLibraryIndex().lookup([]);

  return index.status === "unavailable" ? LIBRARY_INDEX_UNAVAILABLE : null;
};

/** The set positions of a change whose weight was left empty. */
const emptyWeights = (input: PlanProposalInput): string[] =>
  (input.workouts ?? []).flatMap((workout, w) =>
    workout.exercises.flatMap((exercise, e) =>
      exercise.sets.flatMap((set, s) =>
        set.weight_recommended === null
          ? [`workouts.${w}.exercises.${e}.sets.${s}.weight_recommended`]
          : []
      )
    )
  );

/**
 * Checks a proposal to change one of `userId`'s Plans before the User sees
 * it (ADR 0027): its shape and every Plan bound, every Exercise slug against
 * the new Library, that the Plan is the User's and still the one Arnold read
 * (its version marker), every row id against the Plan under the parent it
 * was read under, the Workouts the Plan would be left with, that it changes
 * something, and that the Library index can load when it adds a Workout (for
 * its Cover). Without a `plan_id` it's a new Plan, checked by
 * `checkNewPlan`. Answers `null` when it passes, else the reason for the
 * model, naming what to fix. Reads only; nothing is written.
 */
export const checkPlanProposal = async (
  userId: string,
  toolInput: unknown
): Promise<string | null> => {
  const parsed = planProposalInputSchema.safeParse(toolInput);

  if (!parsed.success) {
    return `The proposal isn't valid, so it wasn't shown: ${inputProblems(parsed.error)}. Fix those and propose again.`;
  }

  const input = parsed.data;

  if (input.plan_id === undefined) {
    return await checkNewPlan(input);
  }

  if (input.plan_version === undefined) {
    return "A change to a plan needs the plan_version get_plan or get_active_plan answered with it. Read the plan and propose again.";
  }

  const empty = emptyWeights(input);

  if (empty.length > 0) {
    return `A change to a plan gives every set a weight (0 for bodyweight); these are empty: ${empty.join(", ")}.`;
  }

  if (
    (input.workouts ?? []).length === 0 &&
    (input.removed_workout_ids ?? []).length === 0 &&
    Object.keys(input.details ?? {}).length === 0
  ) {
    return "The proposal changes nothing: send the changed workouts, the workouts to remove or the changed plan details.";
  }

  const planId = input.plan_id;

  const plan = await asUser(
    userId,
    async (tx) => await getPlan(tx, userId, planId)
  );

  if (plan === null) {
    return `No plan ${input.plan_id} for the user: it doesn't exist or was deleted. Read get_plans for the current plan ids.`;
  }

  const refused = checkAgainstPlan(plan, input);

  if (refused !== null) {
    return refused;
  }

  const slugs = changedSlugs(plan, input);

  if (slugs.length > 0) {
    const unknown = await checkExerciseSlugs(slugs);

    if (unknown) {
      return unknown.error;
    }
  }

  const newWorkouts = (input.workouts ?? []).filter(
    (workout) => workout.id === undefined
  ).length;

  if (newWorkouts > 0) {
    const index = await getLibraryIndex().lookup([]);

    if (index.status === "unavailable") {
      return LIBRARY_INDEX_UNAVAILABLE;
    }
  }

  return null;
};
