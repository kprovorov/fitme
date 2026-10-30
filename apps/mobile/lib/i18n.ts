/**
 * The app's translations: `@fitme/i18n` in the App language, bound to
 * react-i18next. Importing this module starts it, synchronously, so the first
 * render is already in the App language.
 */
// Hermes has no Intl.PluralRules, which i18next needs for plurals. Force mode
// skips the detection (slow on startup); the locale data comes after it.
import "@formatjs/intl-pluralrules/polyfill-force.js";
import "@formatjs/intl-pluralrules/locale-data/en.js";
import "@formatjs/intl-pluralrules/locale-data/uk.js";
import {
  type AppLanguage,
  defaultAppLanguage,
  isAppLanguage,
  resolveAppLanguage,
} from "@fitme/core";
import {
  createI18n,
  type DeviceConventions,
  setDeviceConventions,
} from "@fitme/i18n";
import {
  type Calendar,
  getCalendars,
  getLocales,
  type Locale,
  useCalendars,
  useLocales,
} from "expo-localization";
import { useEffect, useMemo } from "react";
import { setI18n, useTranslation } from "react-i18next";

/** The App language for the device's preferred languages, in order. */
const appLanguageOf = (locales: readonly Locale[]): AppLanguage =>
  resolveAppLanguage(locales.map((locale) => locale.languageTag));

/**
 * The device's region and clock, which dates and numbers follow next to the
 * App language's words (`formatDate(i18n, …)`, `formatNumber(i18n, …)`).
 */
const conventionsOf = (
  locales: readonly Locale[],
  calendars: readonly Calendar[]
): DeviceConventions => ({
  region: locales[0]?.regionCode ?? null,
  uses24hourClock: calendars[0]?.uses24hourClock ?? null,
});

export const i18n = createI18n(appLanguageOf(getLocales()));

let deviceConventions = conventionsOf(getLocales(), getCalendars());
setDeviceConventions(i18n, deviceConventions);

// `useTranslation()` reads this instance, with no provider needed.
setI18n(i18n);

/**
 * Keeps the App language, and the region and clock dates and numbers follow,
 * in step with the device, so a change while the app is open (Android's
 * per-app language) switches it without a restart. Used once, by the root
 * layout.
 */
export function useAppLanguageSync(): void {
  const locales = useLocales();
  const calendars = useCalendars();
  const language = appLanguageOf(locales);
  const { region, uses24hourClock } = conventionsOf(locales, calendars);

  useEffect(() => {
    const conventionsChanged =
      region !== deviceConventions.region ||
      uses24hourClock !== deviceConventions.uses24hourClock;
    deviceConventions = { region, uses24hourClock };
    setDeviceConventions(i18n, deviceConventions);
    if (i18n.language !== language) {
      i18n.changeLanguage(language);
    } else if (conventionsChanged) {
      // Only the region or clock changed: re-render what `useTranslation()`
      // shows, as a language change would, so its dates follow.
      i18n.emit("languageChanged", language);
    }
  }, [language, region, uses24hourClock]);
}

/**
 * The App language the screen's text is in, re-rendering when it changes, so
 * what follows it (the Library's Exercises) switches with the text.
 */
export function useAppLanguage(): AppLanguage {
  const { language } = useTranslation().i18n;
  return isAppLanguage(language) ? language : defaultAppLanguage;
}

/**
 * The App language's instance, for `@fitme/i18n`'s formatters
 * (`formatWeight(i18n, …)`, `formatDate(i18n, …)`), re-rendering the
 * component when the language, or the device's region or clock, changes.
 * Importing it from here starts the instance first, so a component using it
 * works wherever it renders, outside the root layout too.
 */
export function useI18n(): typeof i18n {
  const { i18n: instance, t } = useTranslation();
  // The React Compiler keeps what a component formatted until the object it
  // formatted with changes, and react-i18next hands out the same one while
  // the language stays. A region or clock change only brings a new `t`, so
  // each `t` gets its own view of the instance, and dates follow the device.
  return useMemo(
    () => Object.assign(Object.create(instance) as typeof i18n, { t }),
    [instance, t]
  );
}
