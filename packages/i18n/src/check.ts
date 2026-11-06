import { defaultAppLanguage, isAppLanguage } from "@fitme/core";
import type { AppLanguage } from "@fitme/core";

/** JSON values accepted for checking, including invalid translation leaves. */
type CatalogValue =
  | string
  | number
  | boolean
  | null
  | readonly CatalogValue[]
  | Catalog;

/** A catalog as read from its JSON file: nested objects, strings at the leaves. */
export interface Catalog {
  readonly [key: string]: CatalogValue;
}

type PluralForm = "zero" | "one" | "two" | "few" | "many" | "other";

/**
 * The plural forms each App language needs (its CLDR plural categories, as
 * `Intl.PluralRules` gives them). A plural key in that language's catalog
 * has exactly these, as `<key>_<form>`, plus an optional `_zero`, which
 * i18next uses for a count of 0 in any language.
 */
export const pluralForms: Readonly<Record<AppLanguage, readonly PluralForm[]>> =
  {
    ca: ["one", "many", "other"],
    en: ["one", "other"],
    es: ["one", "many", "other"],
    uk: ["one", "few", "many", "other"],
  };

const PLURAL_SUFFIX = /_(?<form>zero|one|two|few|many|other)$/u;
const PLACEHOLDER = /\{\{\s*(?<name>[^\s,}]+)[^}]*\}\}/gu;

interface Entry {
  key: string;
  /** Why the entry can't be a translation at all, if it can't. */
  problem?: string;
  value: string | null;
}

const isCatalogSection = (value: CatalogValue): value is Catalog =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isTranslation = (value: CatalogValue): value is string =>
  typeof value === "string";

const flatten = (catalog: Catalog, prefix = ""): Entry[] =>
  Object.entries(catalog).flatMap(([name, value]): Entry[] => {
    const key = prefix ? `${prefix}.${name}` : name;

    if (name.includes(".")) {
      // i18next splits keys on ".", so it would never find this one.
      return [{ key, problem: `has a "." in a name`, value: null }];
    }

    if (!isCatalogSection(value)) {
      return [{ key, value: isTranslation(value) ? value : null }];
    }

    return Object.keys(value).length > 0
      ? flatten(value, key)
      : [{ key, problem: "is an empty section", value: null }];
  });

const valueProblems = (language: AppLanguage, entries: Entry[]): string[] =>
  entries.flatMap(({ key, value, problem }) => {
    if (problem !== undefined && problem !== "") {
      return [`${language}: "${key}" ${problem}`];
    }

    if (value === null) {
      return [`${language}: "${key}" is not a string`];
    }

    return value.trim() === "" ? [`${language}: "${key}" is empty`] : [];
  });

interface Key {
  /** The plural forms the catalog has (none for a string). */
  forms: Set<string>;
  kind: "a string" | "a plural";
  /** Every `{{placeholder}}` its value (or any of its forms) uses. */
  placeholders: Set<string>;
}

const placeholdersOf = (value: string | null): string[] => {
  if (value === null) {
    return [];
  }

  return [...value.matchAll(PLACEHOLDER)].map((match) => match[1]);
};

/** Each key of a catalog, a plural by its key without the suffix. */
const keysOf = (
  language: AppLanguage,
  entries: Entry[],
  problems: string[]
): Map<string, Key> => {
  const keys = new Map<string, Key>();

  for (const { key: name, value, problem } of entries) {
    if (problem !== undefined && problem !== "") {
      continue;
    }

    const match = PLURAL_SUFFIX.exec(name);
    const key = match ? name.slice(0, match.index) : name;
    const kind = match ? "a plural" : "a string";
    const existing = keys.get(key);

    if (existing && existing.kind !== kind) {
      problems.push(`${language}: "${key}" is both a string and a plural`);
    }

    const entry = existing ?? {
      forms: new Set(),
      kind,
      placeholders: new Set(),
    };

    if (match) {
      entry.kind = "a plural";
      entry.forms.add(match[1]);
    }

    for (const placeholder of placeholdersOf(value)) {
      entry.placeholders.add(placeholder);
    }

    keys.set(key, entry);
  }

  return keys;
};

const pluralProblems = (
  language: AppLanguage,
  keys: Map<string, Key>
): string[] => {
  const needed: readonly string[] = pluralForms[language];
  const allowed = new Set([...needed, "zero"]);

  return [...keys].flatMap(([key, { kind, forms }]) =>
    kind === "a plural"
      ? [
          ...needed.flatMap((form) =>
            forms.has(form)
              ? []
              : [`${language}: plural "${key}" has no "${form}" form`]
          ),
          ...[...forms].flatMap((form) =>
            allowed.has(form)
              ? []
              : [
                  `${language}: plural "${key}" has a "${form}" form, which ${language} doesn't use`,
                ]
          ),
        ]
      : []
  );
};

const list = (placeholders: Set<string> | undefined) =>
  [...(placeholders ?? [])]
    .toSorted()
    .map((name) => `{{${name}}}`)
    .join(" ") || "none";

/** A key present everywhere: the same kind, and the source's placeholders. */
const sharedKeyProblems = (
  key: string,
  keys: Map<AppLanguage, Map<string, Key>>
): string[] => {
  const languages = [...keys.keys()];
  const of = (language: AppLanguage) => keys.get(language)?.get(key);

  if (new Set(languages.map((language) => of(language)?.kind)).size > 1) {
    const each = languages
      .map((language) => `${of(language)?.kind} in ${language}`)
      .join(", ");

    return [`"${key}" is ${each}`];
  }

  const source = list(of(defaultAppLanguage)?.placeholders);

  return languages.flatMap((language) => {
    if (list(of(language)?.placeholders) === source) {
      return [];
    }

    return [
      `${language}: "${key}" uses ${list(of(language)?.placeholders)}, ${defaultAppLanguage} uses ${source}`,
    ];
  });
};

const sameKeyProblems = (
  keys: Map<AppLanguage, Map<string, Key>>
): string[] => {
  const languages = [...keys.keys()];

  const allKeys = new Set(
    [...keys.values()].flatMap((each) => [...each.keys()])
  );

  return [...allKeys].toSorted().flatMap((key) => {
    const missingFrom = languages.filter(
      (language) => keys.get(language)?.has(key) !== true
    );

    return missingFrom.length > 0
      ? [`"${key}" is missing from ${missingFrom.join(", ")}`]
      : sharedKeyProblems(key, keys);
  });
};

/**
 * The translation check (CI, through this package's tests): every catalog
 * has the same keys with the same `{{placeholders}}`, every plural key has
 * exactly the forms its language needs, and every value is a non-empty
 * string. English is required as the source; smaller sets can be checked in
 * isolation. Catalog completeness is checked separately against appLanguages.
 * Answers one line per problem, none when the catalogs are fine.
 */
export const checkCatalogs = (
  catalogs: Readonly<Partial<Record<AppLanguage, Catalog>> & { en: Catalog }>
): string[] => {
  const problems: string[] = [];
  const keys = new Map<AppLanguage, Map<string, Key>>();

  for (const [name, catalog] of Object.entries(catalogs)) {
    if (!isAppLanguage(name)) {
      continue;
    }

    const language = name;
    const entries = flatten(catalog);
    problems.push(...valueProblems(language, entries));
    const languageKeys = keysOf(language, entries, problems);
    problems.push(...pluralProblems(language, languageKeys));
    keys.set(language, languageKeys);
  }

  problems.push(...sameKeyProblems(keys));

  return problems;
};
