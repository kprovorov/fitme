import { getWeightLabel } from "@fitme/core/labels";
import {
  type Gender,
  type MeasurementSystem,
  measurementSystems,
} from "@fitme/core/models";
import {
  plans,
  profiles,
  type Transaction,
  workoutExerciseSets,
  workoutExercises,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessions,
  workouts,
} from "@fitme/db";
import { and, eq, inArray, isNotNull, or, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

const isKnownSystem = (value: string): value is MeasurementSystem =>
  measurementSystems.some((system) => system === value);

/** Height is stored in cm (metric) or inches (us/uk); weight in kg or lbs. */
const unitsFor = (measurementSystem: string) => {
  const system = isKnownSystem(measurementSystem)
    ? measurementSystem
    : "metric";
  return {
    height: system === "metric" ? "cm" : "in",
    weight: getWeightLabel(system),
  };
};

/** The units every height and weight of a User is stored and shown in. */
export type ProfileUnits = ReturnType<typeof unitsFor>;

/** A User's Profile, as the app's onboarding wrote it, plus its units. */
export interface ProfileWithUnits {
  age: number;
  gender: string;
  height: number;
  measurement_system: string;
  units: ProfileUnits;
  weight: number;
}

/**
 * The User's Profile with its units, in `tx` (from `asUser`), or `null` when
 * they haven't finished onboarding. RLS hides every other User's Profile.
 */
export const getProfile = async (
  tx: Transaction,
  userId: string
): Promise<ProfileWithUnits | null> => {
  const [profile] = await tx
    .select({
      age: profiles.age,
      gender: profiles.gender,
      height: profiles.height,
      measurementSystem: profiles.measurementSystem,
      weight: profiles.weight,
    })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  if (!profile) {
    return null;
  }
  return {
    age: profile.age,
    gender: profile.gender,
    // numeric columns arrive as strings; PostgREST returned numbers
    height: Number(profile.height),
    measurement_system: profile.measurementSystem,
    units: unitsFor(profile.measurementSystem),
    weight: Number(profile.weight),
  };
};

/** Fields of a Profile to change; omitted ones stay as they are. */
export interface ProfileChanges {
  age?: number;
  gender?: Gender;
  /** In the unit of the resulting measurement system (cm or in). */
  height?: number;
  /** Converts every stored height and weight of the User to the new system. */
  measurement_system?: MeasurementSystem;
  /** In the unit of the resulting measurement system (kg or lbs). */
  weight?: number;
}

const isImperial = (system: string) => system === "us" || system === "uk";

/**
 * The weight and height factors from `from` to `to`, as SQL so the arithmetic
 * is Postgres numeric like the RPC's (`1.0 / 2.20462` at numeric precision),
 * or `null` when both store the same units.
 */
const conversionFactors = (
  from: string,
  to: MeasurementSystem
): { height: SQL; weight: SQL } | null => {
  if (isImperial(from) === isImperial(to)) {
    return null;
  }
  return from === "metric"
    ? { height: sql`0.393701`, weight: sql`2.20462` }
    : { height: sql`(1.0 / 0.393701)`, weight: sql`(1.0 / 2.20462)` };
};

const converted = (column: AnyPgColumn, factor: SQL) =>
  sql`round(${column} * ${factor}, 2)`;

/**
 * Converts the User's stored weights to another measurement system, in `tx`:
 * their Plans' set targets and their Workout Sessions' recommended and
 * completed weights, as the `convert_measurement_system` RPC does (which the
 * mobile app still calls: change both together). Like the RPC, it reaches
 * Workout Sessions through their Workout, so a session whose Workout is gone
 * keeps its values.
 */
const convertStoredWeights = async (
  tx: Transaction,
  userId: string,
  weightFactor: SQL
) => {
  await tx
    .update(workoutExerciseSets)
    .set({
      weightRecommended: converted(
        workoutExerciseSets.weightRecommended,
        weightFactor
      ),
    })
    .where(
      inArray(
        workoutExerciseSets.workoutExerciseId,
        tx
          .select({ id: workoutExercises.id })
          .from(workoutExercises)
          .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
          .innerJoin(plans, eq(plans.id, workouts.planId))
          .where(eq(plans.userId, userId))
      )
    );
  await tx
    .update(workoutSessionExerciseSets)
    .set({
      weightCompleted: converted(
        workoutSessionExerciseSets.weightCompleted,
        weightFactor
      ),
      weightRecommended: converted(
        workoutSessionExerciseSets.weightRecommended,
        weightFactor
      ),
    })
    .where(
      and(
        or(
          isNotNull(workoutSessionExerciseSets.weightRecommended),
          isNotNull(workoutSessionExerciseSets.weightCompleted)
        ),
        inArray(
          workoutSessionExerciseSets.workoutSessionExerciseId,
          tx
            .select({ id: workoutSessionExercises.id })
            .from(workoutSessionExercises)
            .innerJoin(
              workoutSessions,
              eq(workoutSessions.id, workoutSessionExercises.workoutSessionId)
            )
            .innerJoin(workouts, eq(workouts.id, workoutSessions.workoutId))
            .innerJoin(plans, eq(plans.id, workouts.planId))
            .where(eq(plans.userId, userId))
        )
      )
    );
};

/**
 * Changes the User's Profile in `tx` (from `asUser`) and returns it with its
 * units, or `null` without changing anything when they have no Profile.
 *
 * A new measurement system first converts every stored height and weight of
 * the User (the Profile's, their Plans' and their Workout Sessions'), as the
 * `convert_measurement_system` RPC does: metric <-> us/uk multiplies by
 * 2.20462 (kg -> lbs) and 0.393701 (cm -> in) or divides by them, rounded to
 * 2 decimals; us <-> uk only changes the system. The given height and weight
 * are then written as they are, in the new system's units. Everything commits
 * with `tx`, so a failure partway leaves nothing changed.
 *
 * Running the same changes again gives the same Profile: the User is already
 * on the new system, so nothing is converted twice.
 */
export const updateProfile = async (
  tx: Transaction,
  userId: string,
  changes: ProfileChanges
): Promise<ProfileWithUnits | null> => {
  const { measurement_system: newSystem } = changes;
  if (newSystem !== undefined && !isKnownSystem(newSystem)) {
    throw new Error(`Invalid measurement system: ${newSystem}`);
  }

  // A no-op UPDATE: row-locks the Profile (taking the table lock the writes
  // below take, so it queues cleanly behind deleteUserData) and reads its
  // system after any concurrent conversion committed, so two conversions
  // never both apply.
  const [current] = await tx
    .update(profiles)
    .set({ measurementSystem: sql`${profiles.measurementSystem}` })
    .where(eq(profiles.userId, userId))
    .returning({ measurementSystem: profiles.measurementSystem });
  if (!current) {
    return null;
  }

  if (newSystem !== undefined && newSystem !== current.measurementSystem) {
    const factors = conversionFactors(current.measurementSystem, newSystem);
    await tx
      .update(profiles)
      .set({
        measurementSystem: newSystem,
        ...(factors && {
          height: converted(profiles.height, factors.height),
          weight: converted(profiles.weight, factors.weight),
        }),
      })
      .where(eq(profiles.userId, userId));
    if (factors) {
      await convertStoredWeights(tx, userId, factors.weight);
    }
  }

  const { age, gender, height, weight } = changes;
  const fields = {
    ...(age !== undefined && { age }),
    ...(gender !== undefined && { gender }),
    ...(height !== undefined && { height: String(height) }),
    ...(weight !== undefined && { weight: String(weight) }),
  };
  if (Object.keys(fields).length > 0) {
    await tx.update(profiles).set(fields).where(eq(profiles.userId, userId));
  }

  return getProfile(tx, userId);
};
