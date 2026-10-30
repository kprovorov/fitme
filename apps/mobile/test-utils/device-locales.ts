/**
 * The device's languages in tests: `setup.ts` mocks `expo-localization` with
 * this module, so every test file starts on an English device (`en-US`) and
 * existing tests stay English. A test sets the device to another language,
 * before rendering or during the test, with `setDeviceLanguages`:
 *
 *   setDeviceLanguages(["uk-UA"]);
 *
 * `useLocales()` re-renders with the new languages, as it does when the
 * device's (or Android's per-app) language changes while the app is open.
 * The device's region is each language tag's (`UA` for `uk-UA`), and its
 * clock is the 12-hour one of an American device until a test sets it with
 * `setDevice24HourClock(true)`. `after-each.ts` puts the device back to
 * English on a 12-hour clock after every test.
 */
import type { Calendar, Locale } from "expo-localization";
import { useSyncExternalStore } from "react";

const ENGLISH_DEVICE = ["en-US"];

/** A `Locale` as the device reports it, for a language tag like `uk-UA`. */
const toLocale = (languageTag: string): Locale => {
  const [languageCode = null, regionCode = null] = languageTag.split("-");
  return {
    currencyCode: null,
    currencySymbol: null,
    decimalSeparator: ".",
    digitGroupingSeparator: ",",
    languageCode,
    languageCurrencyCode: null,
    languageCurrencySymbol: null,
    languageRegionCode: regionCode,
    languageScriptCode: null,
    languageTag,
    measurementSystem: regionCode === "US" ? "us" : "metric",
    regionCode,
    temperatureUnit: regionCode === "US" ? "fahrenheit" : "celsius",
    textDirection: "ltr",
  };
};

let locales: Locale[] = ENGLISH_DEVICE.map(toLocale);
let uses24hourClock = false;
let calendars: [Calendar, ...Calendar[]] = [
  { calendar: null, firstWeekday: 1, timeZone: "UTC", uses24hourClock },
];
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Sets the device's preferred languages, in order (`["uk-UA"]`,
 * `["ru-RU", "uk-UA"]`), and tells every mounted `useLocales()`. Wrap a
 * change during a test in `act`.
 */
export function setDeviceLanguages(languageTags: readonly string[]): void {
  locales = languageTags.map(toLocale);
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Sets the device's clock (`true` for 24-hour) and tells every mounted
 * `useCalendars()`. Wrap a change during a test in `act`.
 */
export function setDevice24HourClock(enabled: boolean): void {
  uses24hourClock = enabled;
  calendars = [{ ...calendars[0], uses24hourClock }];
  for (const listener of listeners) {
    listener();
  }
}

/** Back to the English device on a 12-hour clock every test starts on. */
export function resetDeviceLanguages(): void {
  setDeviceLanguages(ENGLISH_DEVICE);
  setDevice24HourClock(false);
}

const getLocales = (): Locale[] => locales;
const getCalendars = (): [Calendar, ...Calendar[]] => calendars;

/** The `expo-localization` module the tests see. */
export const localizationModule = {
  getCalendars,
  getLocales,
  useCalendars: () => useSyncExternalStore(subscribe, getCalendars),
  useLocales: () => useSyncExternalStore(subscribe, getLocales),
};
