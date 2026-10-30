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
 * The device's conventions dates and numbers follow, next to the App
 * language's words: its region (`UA`, `GB`) and its clock.
 */
export interface DeviceConventions {
  /** The device region, `null` for none. */
  region: string | null;
  /** The device's clock: 24-hour, 12-hour, or `null` for the locale's own. */
  uses24hourClock: boolean | null;
}

const NO_CONVENTIONS: DeviceConventions = {
  region: null,
  uses24hourClock: null,
};

// Per instance, so tests' instances never share the app's device.
const conventionsByInstance = new WeakMap<object, DeviceConventions>();

/**
 * Sets the device's region and clock for an instance's dates and numbers,
 * the catalogs' `{{…, number}}` placeholders included. Without them, the App
 * language's own conventions apply.
 */
export function setDeviceConventions(
  translator: Translator,
  conventions: DeviceConventions
): void {
  const original = (translator as { __original?: object }).__original;
  conventionsByInstance.set(original ?? translator, conventions);
}

/**
 * The instance behind a translator. react-i18next's `useTranslation().i18n`
 * is a copy of it pointing back at it as `__original`, and the app's
 * `useI18n()` a view inheriting from either.
 */
const instanceOf = (translator: Translator): object => {
  let current: object | null = translator;
  while (current) {
    if (conventionsByInstance.has(current)) {
      return current;
    }
    const original: object | undefined = (current as { __original?: object })
      .__original;
    current =
      original && original !== current
        ? original
        : Object.getPrototypeOf(current);
  }
  return translator;
};

const conventionsOf = (translator: Translator): DeviceConventions =>
  conventionsByInstance.get(instanceOf(translator)) ?? NO_CONVENTIONS;

/** The device region set for an instance, `null` for none. */
export const regionOf = (translator: Translator): string | null =>
  conventionsOf(translator).region;

// A BCP 47 region subtag: two letters (`UA`) or three digits (`419`).
const REGION = /^(?:[A-Z]{2}|\d{3})$/;

/** A language with a region, when the region is a usable one: `uk-UA`. */
export const withRegion = (language: string, region: string | null): string =>
  region && REGION.test(region) ? `${language}-${region}` : language;

/**
 * The locale dates and numbers are written in: the App language plus the
 * device region (`uk-UA`, `en-GB`), so a Ukrainian speaker gets Ukrainian
 * month names in their region's order.
 */
export const formatLocale = (translator: Translator): string =>
  withRegion(translator.language, regionOf(translator));

// Intl formatters are costly to build, and the app formats in lists.
const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

/** A cached `Intl.NumberFormat` for a locale and its options. */
export const numberFormat = (
  locale: string,
  options: Intl.NumberFormatOptions = {}
): Intl.NumberFormat => {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    numberFormats.set(key, format);
  }
  return format;
};

const dateFormat = (
  locale: string,
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat => {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    dateFormats.set(key, format);
  }
  return format;
};

/**
 * A number as the App language and device region write it: `62.5` / `62,5`,
 * `12,500` / `12 500`. The catalogs' `{{…, number}}` placeholders format the
 * same way.
 */
export const formatNumber = (translator: Translator, value: number): string =>
  numberFormat(formatLocale(translator)).format(value);

/** The dates the app shows, each in the locale's own order and words. */
const DATE_STYLES = {
  /** `October 21`, `21 October`, `21 жовтня`. */
  dayMonth: { day: "numeric", month: "long" },
  /** `October 21, 2026`, `21 жовтня 2026 р.`. */
  dayMonthYear: { day: "numeric", month: "long", year: "numeric" },
  /** A month heading: `October 2026`, `жовтень 2026 р.`. */
  monthYear: { month: "long", year: "numeric" },
  /** `Wed, Oct 21`, `ср, 21 жовт.`. */
  weekdayDayMonth: { day: "numeric", month: "short", weekday: "short" },
  /** `Wed, Oct 21, 2026`, `ср, 21 жовт. 2026 р.`. */
  weekdayDayMonthYear: {
    day: "numeric",
    month: "short",
    weekday: "short",
    year: "numeric",
  },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

export type DateStyle = keyof typeof DATE_STYLES;

/** A date in one of the app's styles, as the App language and device region write it. */
export const formatDate = (
  translator: Translator,
  date: Date,
  style: DateStyle
): string =>
  dateFormat(formatLocale(translator), DATE_STYLES[style]).format(date);

/** A time of day on the device's clock: `18:05` or `6:05 PM`. */
export const formatTime = (translator: Translator, date: Date): string => {
  const { uses24hourClock } = conventionsOf(translator);
  return dateFormat(formatLocale(translator), {
    hour: "numeric",
    minute: "2-digit",
    ...(uses24hourClock === null ? {} : { hour12: !uses24hourClock }),
  }).format(date);
};

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
