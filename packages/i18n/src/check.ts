import type { AppLanguage } from "@fitme/core";

/** A catalog as read from its JSON file: nested objects, strings at the leaves. */
export type Catalog = Readonly<Record<string, unknown>>;

type PluralForm = "zero" | "one" | "two" | "few" | "many" | "other";

/**
 * The plural forms each App language needs (its CLDR plural categories, as
 * `Intl.PluralRules` gives them). A plural key in that language's catalog
 * has exactly these, as `<key>_<form>`.
 */
export const pluralForms: Readonly<Record<AppLanguage, readonly PluralForm[]>> =
  {
    en: ["one", "other"],
    uk: ["one", "few", "many", "other"],
  };

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

interface Entry {
  key: string;
  value: unknown;
}

function flatten(catalog: Catalog, prefix = ""): Entry[] {
  return Object.entries(catalog).flatMap(([name, value]) => {
    const key = prefix ? `${prefix}.${name}` : name;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return flatten(value as Catalog, key);
    }
    return [{ key, value }];
  });
}

interface Keys {
  /** Every key that isn't a plural form. */
  plain: Set<string>;
  /** Each plural key (without its suffix) with the forms the catalog has. */
  plurals: Map<string, Set<string>>;
}

function keysOf(entries: Entry[]): Keys {
  const keys: Keys = { plain: new Set(), plurals: new Map() };
  for (const { key } of entries) {
    const match = PLURAL_SUFFIX.exec(key);
    if (!match) {
      keys.plain.add(key);
      continue;
    }
    const base = key.slice(0, match.index);
    const forms = keys.plurals.get(base) ?? new Set<string>();
    forms.add(match[1]);
    keys.plurals.set(base, forms);
  }
  return keys;
}

type Kind = "a string" | "a plural";

/** Each key of a catalog (a plural by its key without the suffix) and its kind. */
function kindsOf(keys: Keys): Map<string, Kind> {
  const kinds = new Map<string, Kind>();
  for (const key of keys.plain) {
    kinds.set(key, "a string");
  }
  for (const key of keys.plurals.keys()) {
    kinds.set(key, "a plural");
  }
  return kinds;
}

function valueProblems(language: AppLanguage, entries: Entry[]): string[] {
  return entries.flatMap(({ key, value }) => {
    if (typeof value !== "string") {
      return [`${language}: "${key}" is not a string`];
    }
    return value.trim() === "" ? [`${language}: "${key}" is empty`] : [];
  });
}

function pluralProblems(language: AppLanguage, keys: Keys): string[] {
  const needed: readonly string[] = pluralForms[language];
  return [...keys.plurals].flatMap(([key, forms]) => [
    ...needed
      .filter((form) => !forms.has(form))
      .map((form) => `${language}: plural "${key}" has no "${form}" form`),
    ...[...forms]
      .filter((form) => !needed.includes(form))
      .map(
        (form) =>
          `${language}: plural "${key}" has a "${form}" form, which ${language} doesn't use`
      ),
    ...(keys.plain.has(key)
      ? [`${language}: "${key}" is both a string and a plural`]
      : []),
  ]);
}

function sameKeyProblems(kinds: Map<AppLanguage, Map<string, Kind>>): string[] {
  const languages = [...kinds.keys()];
  const allKeys = new Set(
    [...kinds.values()].flatMap((each) => [...each.keys()])
  );
  return [...allKeys].sort().flatMap((key) => {
    const missingFrom = languages.filter(
      (language) => !kinds.get(language)?.has(key)
    );
    if (missingFrom.length > 0) {
      return [`"${key}" is missing from ${missingFrom.join(", ")}`];
    }
    const kindIn = (language: AppLanguage) => kinds.get(language)?.get(key);
    if (new Set(languages.map(kindIn)).size === 1) {
      return [];
    }
    const each = languages
      .map((language) => `${kindIn(language)} in ${language}`)
      .join(", ");
    return [`"${key}" is ${each}`];
  });
}

/**
 * The translation check (CI, through this package's tests): every catalog
 * has the same keys, every plural key has exactly the forms its language
 * needs, and every value is a non-empty string. Answers one line per
 * problem, none when the catalogs are fine.
 */
export function checkCatalogs(
  catalogs: Readonly<Record<AppLanguage, Catalog>>
): string[] {
  const problems: string[] = [];
  const kinds = new Map<AppLanguage, Map<string, Kind>>();
  for (const language of Object.keys(catalogs) as AppLanguage[]) {
    const entries = flatten(catalogs[language]);
    const keys = keysOf(entries);
    problems.push(
      ...valueProblems(language, entries),
      ...pluralProblems(language, keys)
    );
    kinds.set(language, kindsOf(keys));
  }
  problems.push(...sameKeyProblems(kinds));
  return problems;
}
