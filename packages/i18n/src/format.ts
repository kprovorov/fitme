import { inchesToFeetAndInches, type MeasurementSystem } from "@fitme/core";
import type { i18n } from "i18next";

/**
 * What the helpers read from an i18next instance: its `t`, and its language
 * for numbers. `createI18n`'s instance, or the app's.
 */
export type Translator = Pick<i18n, "language" | "t">;

/** The unit codes heights and weights are stored and shown in (the Profile's `units`). */
export type Unit = "cm" | "in" | "kg" | "lbs";

/** Everything the app counts, each a plural in the catalogs (`counts.<kind>`). */
export type CountKind =
  | "exercises"
  | "minutes"
  | "reps"
  | "sets"
  | "workoutSessions"
  | "workouts";

/**
 * A number as the App language writes it: `62.5` / `62,5`, `12,500` /
 * `12 500`. The catalogs' `{{…, number}}` placeholders format the same way.
 */
export const formatNumber = (translator: Translator, value: number): string =>
  new Intl.NumberFormat(translator.language).format(value);

/** `3 sets`, `3 підходи`, `5 підходів`: a count with its plural form. */
export const formatCount = (
  translator: Translator,
  kind: CountKind,
  count: number
): string => translator.t(`counts.${kind}`, { count });

/** A unit's short name on its own, for a column header: `kg`, `кг`. */
export const unitName = (translator: Translator, unit: Unit): string =>
  translator.t(`unitNames.${unit}`);

/** A value with its unit: `62.5 kg`, `62,5 кг`. */
export const formatUnit = (
  translator: Translator,
  value: number,
  unit: Unit
): string => translator.t(`units.${unit}`, { value });

/** A value with its unit spelled out, for VoiceOver: `32.5 kilograms`. */
export const spokenUnit = (
  translator: Translator,
  value: number,
  unit: Unit
): string => translator.t(`spokenUnits.${unit}`, { count: value });

/** The unit a measurement system stores weights in. */
export const weightUnitOf = (measurementSystem: MeasurementSystem): Unit =>
  measurementSystem === "metric" ? "kg" : "lbs";

/** A weight in the measurement system's unit (the User's choice, not the language's). */
export const formatWeight = (
  translator: Translator,
  weight: number,
  measurementSystem: MeasurementSystem
): string => formatUnit(translator, weight, weightUnitOf(measurementSystem));

/** A height: centimeters for metric, otherwise feet and inches (`5′ 11″`). */
export const formatHeight = (
  translator: Translator,
  height: number,
  measurementSystem: MeasurementSystem
): string => {
  if (measurementSystem === "metric") {
    return formatUnit(translator, height, "cm");
  }
  const { feet, inches } = inchesToFeetAndInches(height);
  return `${feet}′ ${inches}″`;
};

const MINUTE_MS = 60_000;

/** A finished workout's length: `42min`, `1h 5min` (`42 хв`, `1 год 5 хв`). */
export const formatWorkoutDuration = (
  translator: Translator,
  startedAt: string,
  finishedAt: string
): string => {
  const totalMinutes = Math.max(
    0,
    Math.round(
      (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) /
        MINUTE_MS
    )
  );
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0
    ? translator.t("duration.hoursMinutes", { hours, minutes })
    : translator.t("duration.minutes", { minutes });
};
