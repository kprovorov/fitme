import { type AppLanguage, defaultAppLanguage } from "@fitme/core";
import i18next, { type i18n } from "i18next";
import en from "./catalogs/en.json";
import uk from "./catalogs/uk.json";

export { type Catalog, checkCatalogs, pluralForms } from "./check";

import { numberFormat, regionOf, withRegion } from "./format";

export {
  type CountKind,
  type DateStyle,
  type DeviceConventions,
  formatCompactVolume,
  formatCount,
  formatDate,
  formatDuration,
  formatHeight,
  formatLocale,
  formatNumber,
  formatTime,
  formatUnit,
  formatWeight,
  formatWorkoutDuration,
  setDeviceConventions,
  spokenCompactVolume,
  spokenUnit,
  type Translator,
  type Unit,
  unitName,
  weightUnitOf,
} from "./format";

// The `number(…)` options the catalogs may set. i18next hands a formatter
// every option of the `t` call too (`count`, `lng`…), which aren't Intl's.
const NUMBER_FORMAT_OPTIONS = [
  "maximumFractionDigits",
  "minimumFractionDigits",
  "useGrouping",
] as const;

const numberFormatOptions = (
  options: Record<string, unknown> = {}
): Intl.NumberFormatOptions =>
  Object.fromEntries(
    NUMBER_FORMAT_OPTIONS.filter((key) => key in options).map((key) => [
      key,
      options[key],
    ])
  );

/** The one namespace: every key lives in `translation`. */
export const defaultNamespace = "translation";

/** Every App language's catalog. English is the source and the fallback. */
export const catalogs = { en, uk } satisfies Record<AppLanguage, object>;

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNamespace;
    // English is the source catalog, so its keys are the typed ones.
    resources: { translation: typeof en };
    returnNull: false;
  }
}

/**
 * A ready i18next instance for an App language, set up synchronously with
 * every catalog bundled (no backend, nothing loaded later). A key missing
 * from the language's catalog falls back to English.
 */
export function createI18n(language: AppLanguage): i18n {
  const instance = i18next.createInstance();
  instance.init({
    defaultNS: defaultNamespace,
    fallbackLng: defaultAppLanguage,
    initAsync: false,
    // React escapes what it renders; escaping here would double it.
    interpolation: { escapeValue: false },
    lng: language,
    ns: [defaultNamespace],
    resources: Object.fromEntries(
      Object.entries(catalogs).map(([lng, catalog]) => [
        lng,
        { [defaultNamespace]: catalog },
      ])
    ),
    returnNull: false,
    supportedLngs: Object.keys(catalogs),
  });
  // The catalogs' `{{…, number}}` placeholders take the device region too,
  // so `62.5 kg` reads like every other number (`formatNumber`).
  instance.services.formatter?.add("number", (value, lng, options) =>
    numberFormat(
      withRegion(lng ?? instance.language, regionOf(instance)),
      numberFormatOptions(options)
    ).format(value)
  );
  return instance;
}
