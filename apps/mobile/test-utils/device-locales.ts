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
 * `after-each.ts` puts the device back to English after every test.
 */
import type { Locale } from "expo-localization";
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

/** Back to the English device every test starts on. */
export function resetDeviceLanguages(): void {
  setDeviceLanguages(ENGLISH_DEVICE);
}

const getLocales = (): Locale[] => locales;

/** The `expo-localization` module the tests see. */
export const localizationModule = {
  getLocales,
  useLocales: () => useSyncExternalStore(subscribe, getLocales),
};
