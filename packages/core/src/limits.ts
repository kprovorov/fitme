/**
 * Bounds on a set's reps and weight, shared by every app that takes them: the
 * mobile set inputs, MCP's plan and session tools, Arnold's Plan edits.
 * Weights are stored as numeric(8,2), so a weight has at most 2 decimals.
 */
export const MAX_REPS = 1000;
export const MAX_WEIGHT = 10_000;
export const MAX_WEIGHT_DECIMALS = 2;

/** A set's recommended rest, in seconds. */
export const MAX_REST_SECONDS = 3600;

/**
 * Bounds on a Plan write, as the Public API enforces them (the same values as MCP's plan schemas):
 * a Plan's and a Workout's name and text lengths, list sizes, Workouts a week
 * and minutes per Workout.
 */
export const MAX_PLAN_NAME_LENGTH = 200;
export const MAX_PLAN_TEXT_LENGTH = 2000;
export const MAX_WORKOUTS_PER_PLAN = 14;
export const MAX_EXERCISES_PER_WORKOUT = 30;
export const MAX_SETS_PER_EXERCISE = 20;
export const MIN_FREQUENCY = 1;
export const MAX_FREQUENCY = 7;
export const MAX_WORKOUT_DURATION_MINUTES = 600;
/** The longest Exercise slug a Plan write accepts. */
export const MAX_EXERCISE_SLUG_LENGTH = 100;

/**
 * Bounds on a Profile edit. Heights and weights are generous in either unit
 * (cm or in, kg or lbs), well inside numeric(8,2) after a conversion, and have
 * at most 2 decimals.
 */
export const MIN_AGE = 10;
export const MAX_AGE = 120;
export const MAX_BODY_HEIGHT = 300;
export const MAX_BODY_WEIGHT = 1000;
export const MAX_BODY_DECIMALS = 2;
