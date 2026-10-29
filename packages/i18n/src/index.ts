import { type AppLanguage, defaultAppLanguage } from "@fitme/core";
import i18next, { type i18n } from "i18next";
import en from "./catalogs/en.json";
import uk from "./catalogs/uk.json";

export { type Catalog, checkCatalogs, pluralForms } from "./check";

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
  return instance;
}
