import { genders, measurementSystems } from "@fitme/core";
import type { Gender, MeasurementSystem } from "@fitme/core";

/**
 * The fields of a Profile from `GET /v1/profile` (or a write's answer) that
 * the API types as plain strings.
 */
interface ProfileChoices {
  gender: string;
  measurement_system: string;
}

const isMeasurementSystem = (value: string): value is MeasurementSystem =>
  (measurementSystems as readonly string[]).includes(value);

const isGender = (value: string): value is Gender =>
  (genders as readonly string[]).includes(value);

/**
 * The Profile's measurement system; without a Profile, or with a system the
 * app doesn't know, metric, as the services count it.
 */
export const measurementSystemOf = (
  profile: Pick<ProfileChoices, "measurement_system"> | null | undefined
): MeasurementSystem =>
  profile && isMeasurementSystem(profile.measurement_system)
    ? profile.measurement_system
    : "metric";

/** The Profile's gender, or `undefined` without one the app knows. */
export const genderOf = (
  profile: Pick<ProfileChoices, "gender"> | null | undefined
): Gender | undefined =>
  profile && isGender(profile.gender) ? profile.gender : undefined;
