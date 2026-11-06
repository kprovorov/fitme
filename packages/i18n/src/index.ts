import { defaultAppLanguage } from "@fitme/core";
import type { AppLanguage } from "@fitme/core";
import { createInstance } from "i18next";
import type { i18n } from "i18next";

import ca from "./catalogs/ca.json";
import en from "./catalogs/en.json";
import es from "./catalogs/es.json";
import uk from "./catalogs/uk.json";
import type { Catalog } from "./check";
import { numberFormat, regionOf, withRegion } from "./format";

export { type Catalog, checkCatalogs, pluralForms } from "./check";

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
  options: Intl.NumberFormatOptions = {}
): Intl.NumberFormatOptions =>
  Object.fromEntries(
    NUMBER_FORMAT_OPTIONS.flatMap((key) =>
      key in options ? [[key, options[key]]] : []
    )
  );

/** The one namespace: every key lives in `translation`. */
export const defaultNamespace = "translation";

/** Every App language's catalog. English is the source and the fallback. */
export const catalogs = { ca, en, es, uk } satisfies Record<
  AppLanguage,
  Catalog
>;

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
export const createI18n = (language: AppLanguage): i18n => {
  const instance = createInstance();
  void instance.init({
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
  instance.services.formatter?.add(
    "number",
    (value: number | bigint, lng, options: Intl.NumberFormatOptions = {}) =>
      numberFormat(
        withRegion(lng ?? instance.language, regionOf(instance)),
        numberFormatOptions(options)
      ).format(value)
  );

  return instance;
};
