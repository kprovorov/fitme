import { getWeightLabel } from "@fitme/core/labels";
import { type MeasurementSystem, measurementSystems } from "@fitme/core/models";
import { profiles, type Transaction } from "@fitme/db";
import { eq } from "drizzle-orm";

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
