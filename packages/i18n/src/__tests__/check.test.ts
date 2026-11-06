import { describe, expect, it } from "vitest";

import { checkCatalogs, pluralForms } from "../check";

const en = {
  counts: { sets_one: "{{count}} set", sets_other: "{{count}} sets" },
  tabs: { home: "Home" },
};

const uk = {
  counts: {
    sets_few: "{{count}} підходи",
    sets_many: "{{count}} підходів",
    sets_one: "{{count}} підхід",
    sets_other: "{{count}} підходу",
  },
  tabs: { home: "Головна" },
};

describe("catalog validation", () => {
  it("passes matching catalogs", () => {
    expect(checkCatalogs({ en, uk })).toStrictEqual([]);
  });

  it("fails a key in only one catalog", () => {
    expect(
      checkCatalogs({ en: { ...en, extra: "Only English" }, uk })
    ).toStrictEqual(['"extra" is missing from uk']);
    expect(
      checkCatalogs({
        en,
        uk: { ...uk, tabs: { ...uk.tabs, library: "Бібліотека" } },
      })
    ).toStrictEqual(['"tabs.library" is missing from en']);
  });

  it("fails a plural in only one catalog", () => {
    expect(checkCatalogs({ en: { tabs: en.tabs }, uk })).toStrictEqual([
      '"counts.sets" is missing from en',
    ]);
  });

  it("fails a Ukrainian plural missing a form", () => {
    const { sets_few: _, ...counts } = uk.counts;
    expect(checkCatalogs({ en, uk: { ...uk, counts } })).toStrictEqual([
      'uk: plural "counts.sets" has no "few" form',
    ]);
  });

  it("fails an English plural missing a form", () => {
    const { sets_one: _, ...counts } = en.counts;
    expect(checkCatalogs({ en: { ...en, counts }, uk })).toStrictEqual([
      'en: plural "counts.sets" has no "one" form',
    ]);
  });

  it("fails a form the language doesn't use", () => {
    expect(
      checkCatalogs({
        en: { ...en, counts: { ...en.counts, sets_few: "{{count}} sets" } },
        uk,
      })
    ).toStrictEqual([
      `en: plural "counts.sets" has a "few" form, which en doesn't use`,
    ]);
  });

  it("fails a key that is a string in one catalog and a plural in another", () => {
    expect(
      checkCatalogs({ en: { ...en, counts: { sets: "Sets" } }, uk })
    ).toStrictEqual(['"counts.sets" is a string in en, a plural in uk']);
  });

  it("fails a key that is both a string and a plural in one catalog", () => {
    expect(
      checkCatalogs({
        en: { ...en, counts: { ...en.counts, sets: "Sets" } },
        uk: { ...uk, counts: { ...uk.counts, sets: "Підходи" } },
      })
    ).toStrictEqual([
      'en: "counts.sets" is both a string and a plural',
      'uk: "counts.sets" is both a string and a plural',
    ]);
  });

  it("fails a translation that drops or renames a placeholder", () => {
    expect(
      checkCatalogs({
        en,
        uk: {
          ...uk,
          counts: {
            ...uk.counts,
            sets_few: "{{cnt}} підходи",
            sets_many: "підходів",
          },
        },
      })
    ).toStrictEqual([
      'uk: "counts.sets" uses {{cnt}} {{count}}, en uses {{count}}',
    ]);
  });

  it("accepts a placeholder in some plural forms only, and formatted ones", () => {
    expect(
      checkCatalogs({
        en: {
          ...en,
          counts: { sets_one: "One set", sets_other: "{{count, number}} sets" },
        },
        uk,
      })
    ).toStrictEqual([]);
  });

  it("accepts an optional zero form in any language", () => {
    expect(
      checkCatalogs({
        en: { ...en, counts: { ...en.counts, sets_zero: "No sets" } },
        uk: { ...uk, counts: { ...uk.counts, sets_zero: "Жодного підходу" } },
      })
    ).toStrictEqual([]);
  });

  it("fails a name with a dot, which i18next can't look up", () => {
    expect(
      checkCatalogs({ en: { counts: en.counts, "tabs.home": "Home" }, uk })
    ).toStrictEqual([
      'en: "tabs.home" has a "." in a name',
      '"tabs.home" is missing from en',
    ]);
  });

  it("fails an empty section", () => {
    expect(checkCatalogs({ en: { ...en, settings: {} }, uk })).toStrictEqual([
      'en: "settings" is an empty section',
    ]);
  });

  it("fails an empty value", () => {
    expect(
      checkCatalogs({ en, uk: { ...uk, tabs: { home: "  " } } })
    ).toStrictEqual(['uk: "tabs.home" is empty']);
  });

  it("fails a value that isn't a string", () => {
    expect(
      checkCatalogs({ en: { ...en, tabs: { home: ["Home"] } }, uk })
    ).toStrictEqual(['en: "tabs.home" is not a string']);
  });
});

describe("plural categories", () => {
  it.each(Object.entries(pluralForms))(
    "matches %s's plural categories",
    (language, forms) => {
      const categories = new Intl.PluralRules(language).resolvedOptions()
        .pluralCategories;

      expect(forms.toSorted()).toStrictEqual(categories.toSorted());
    }
  );
});
