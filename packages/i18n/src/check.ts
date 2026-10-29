import { type AppLanguage, defaultAppLanguage } from "@fitme/core";

/** A catalog as read from its JSON file: nested objects, strings at the leaves. */
export type Catalog = Readonly<Record<string, unknown>>;

type PluralForm = "zero" | "one" | "two" | "few" | "many" | "other";

/**
 * The plural forms each App language needs (its CLDR plural categories, as
 * `Intl.PluralRules` gives them). A plural key in that language's catalog
 * has exactly these, as `<key>_<form>`, plus an optional `_zero`, which
 * i18next uses for a count of 0 in any language.
 */
export const pluralForms: Readonly<Record<AppLanguage, readonly PluralForm[]>> =
  {
    en: ["one", "other"],
    uk: ["one", "few", "many", "other"],
  };

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const PLACEHOLDER = /\{\{\s*([^\s,}]+)[^}]*\}\}/g;

interface Entry {
  key: string;
  /** Why the entry can't be a translation at all, if it can't. */
  problem?: string;
  value: unknown;
}

function flatten(catalog: Catalog, prefix = ""): Entry[] {
  return Object.entries(catalog).flatMap(([name, value]): Entry[] => {
    const key = prefix ? `${prefix}.${name}` : name;
    if (name.includes(".")) {
      // i18next splits keys on ".", so it would never find this one.
      return [{ key, problem: `has a "." in a name`, value }];
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return [{ key, value }];
    }
    return Object.keys(value).length > 0
      ? flatten(value as Catalog, key)
      : [{ key, problem: "is an empty section", value }];
  });
}

function valueProblems(language: AppLanguage, entries: Entry[]): string[] {
  return entries.flatMap(({ key, value, problem }) => {
    if (problem) {
      return [`${language}: "${key}" ${problem}`];
    }
    if (typeof value !== "string") {
      return [`${language}: "${key}" is not a string`];
    }
    return value.trim() === "" ? [`${language}: "${key}" is empty`] : [];
  });
}

interface Key {
  /** The plural forms the catalog has (none for a string). */
  forms: Set<string>;
  kind: "a string" | "a plural";
  /** Every `{{placeholder}}` its value (or any of its forms) uses. */
  placeholders: Set<string>;
}

function placeholdersOf(value: unknown): string[] {
  return typeof value === "string"
    ? [...value.matchAll(PLACEHOLDER)].map((match) => match[1])
    : [];
}

/** Each key of a catalog, a plural by its key without the suffix. */
function keysOf(
  language: AppLanguage,
  entries: Entry[],
  problems: string[]
): Map<string, Key> {
  const keys = new Map<string, Key>();
  for (const { key: name, value, problem } of entries) {
    if (problem) {
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
}

function pluralProblems(
  language: AppLanguage,
  keys: Map<string, Key>
): string[] {
  const needed: readonly string[] = pluralForms[language];
  const allowed = new Set([...needed, "zero"]);
  return [...keys]
    .filter(([, { kind }]) => kind === "a plural")
    .flatMap(([key, { forms }]) => [
      ...needed
        .filter((form) => !forms.has(form))
        .map((form) => `${language}: plural "${key}" has no "${form}" form`),
      ...[...forms]
        .filter((form) => !allowed.has(form))
        .map(
          (form) =>
            `${language}: plural "${key}" has a "${form}" form, which ${language} doesn't use`
        ),
    ]);
}

const list = (placeholders: Set<string> | undefined) =>
  [...(placeholders ?? [])]
    .sort()
    .map((name) => `{{${name}}}`)
    .join(" ") || "none";

/** A key present everywhere: the same kind, and the source's placeholders. */
function sharedKeyProblems(
  key: string,
  keys: Map<AppLanguage, Map<string, Key>>
): string[] {
  const languages = [...keys.keys()];
  const of = (language: AppLanguage) => keys.get(language)?.get(key);
  if (new Set(languages.map((language) => of(language)?.kind)).size > 1) {
    const each = languages
      .map((language) => `${of(language)?.kind} in ${language}`)
      .join(", ");
    return [`"${key}" is ${each}`];
  }
  const source = list(of(defaultAppLanguage)?.placeholders);
  return languages
    .filter((language) => list(of(language)?.placeholders) !== source)
    .map(
      (language) =>
        `${language}: "${key}" uses ${list(of(language)?.placeholders)}, ${defaultAppLanguage} uses ${source}`
    );
}

function sameKeyProblems(keys: Map<AppLanguage, Map<string, Key>>): string[] {
  const languages = [...keys.keys()];
  const allKeys = new Set(
    [...keys.values()].flatMap((each) => [...each.keys()])
  );
  return [...allKeys].sort().flatMap((key) => {
    const missingFrom = languages.filter(
      (language) => !keys.get(language)?.has(key)
    );
    return missingFrom.length > 0
      ? [`"${key}" is missing from ${missingFrom.join(", ")}`]
      : sharedKeyProblems(key, keys);
  });
}

/**
 * The translation check (CI, through this package's tests): every catalog
 * has the same keys with the same `{{placeholders}}`, every plural key has
 * exactly the forms its language needs, and every value is a non-empty
 * string. Answers one line per problem, none when the catalogs are fine.
 */
export function checkCatalogs(
  catalogs: Readonly<Record<AppLanguage, Catalog>>
): string[] {
  const problems: string[] = [];
  const keys = new Map<AppLanguage, Map<string, Key>>();
  for (const language of Object.keys(catalogs) as AppLanguage[]) {
    const entries = flatten(catalogs[language]);
    problems.push(...valueProblems(language, entries));
    const languageKeys = keysOf(language, entries, problems);
    problems.push(...pluralProblems(language, languageKeys));
    keys.set(language, languageKeys);
  }
  problems.push(...sameKeyProblems(keys));
  return problems;
}
