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
import { type AppLanguage, resolveAppLanguage } from "@fitme/core";
import { createI18n } from "@fitme/i18n";
import { getLocales, type Locale, useLocales } from "expo-localization";
import { useEffect } from "react";
import { setI18n } from "react-i18next";

/** The App language for the device's preferred languages, in order. */
const appLanguageOf = (locales: readonly Locale[]): AppLanguage =>
  resolveAppLanguage(locales.map((locale) => locale.languageTag));

export const i18n = createI18n(appLanguageOf(getLocales()));

// `useTranslation()` reads this instance, with no provider needed.
setI18n(i18n);

/**
 * Keeps the App language in step with the device's languages, so a change
 * while the app is open (Android's per-app language) switches it without a
 * restart. Used once, by the root layout.
 */
export function useAppLanguageSync(): void {
  const language = appLanguageOf(useLocales());

  useEffect(() => {
    if (i18n.language !== language) {
      i18n.changeLanguage(language);
    }
  }, [language]);
}
