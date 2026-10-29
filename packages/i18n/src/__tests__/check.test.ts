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

describe("checkCatalogs", () => {
  it("passes matching catalogs", () => {
    expect(checkCatalogs({ en, uk })).toEqual([]);
  });

  it("fails a key in only one catalog", () => {
    expect(checkCatalogs({ en: { ...en, extra: "Only English" }, uk })).toEqual(
      ['"extra" is missing from uk']
    );
    expect(
      checkCatalogs({
        en,
        uk: { ...uk, tabs: { ...uk.tabs, library: "Бібліотека" } },
      })
    ).toEqual(['"tabs.library" is missing from en']);
  });

  it("fails a plural in only one catalog", () => {
    expect(checkCatalogs({ en: { counts: {}, tabs: en.tabs }, uk })).toEqual([
      '"counts.sets" is missing from en',
    ]);
  });

  it("fails a Ukrainian plural missing a form", () => {
    const { sets_few: _, ...counts } = uk.counts;
    expect(checkCatalogs({ en, uk: { ...uk, counts } })).toEqual([
      'uk: plural "counts.sets" has no "few" form',
    ]);
  });

  it("fails an English plural missing a form", () => {
    const { sets_one: _, ...counts } = en.counts;
    expect(checkCatalogs({ en: { ...en, counts }, uk })).toEqual([
      'en: plural "counts.sets" has no "one" form',
    ]);
  });

  it("fails a form the language doesn't use", () => {
    expect(
      checkCatalogs({
        en: { ...en, counts: { ...en.counts, sets_few: "{{count}} sets" } },
        uk,
      })
    ).toEqual([
      `en: plural "counts.sets" has a "few" form, which en doesn't use`,
    ]);
  });

  it("fails a key that is a string in one catalog and a plural in another", () => {
    expect(
      checkCatalogs({ en: { ...en, counts: { sets: "Sets" } }, uk })
    ).toEqual(['"counts.sets" is a string in en, a plural in uk']);
  });

  it("fails a key that is both a string and a plural in one catalog", () => {
    expect(
      checkCatalogs({
        en: { ...en, counts: { ...en.counts, sets: "Sets" } },
        uk: { ...uk, counts: { ...uk.counts, sets: "Підходи" } },
      })
    ).toEqual([
      'en: "counts.sets" is both a string and a plural',
      'uk: "counts.sets" is both a string and a plural',
    ]);
  });

  it("fails an empty value", () => {
    expect(checkCatalogs({ en, uk: { ...uk, tabs: { home: "  " } } })).toEqual([
      'uk: "tabs.home" is empty',
    ]);
  });

  it("fails a value that isn't a string", () => {
    expect(
      checkCatalogs({ en: { ...en, tabs: { home: ["Home"] } }, uk })
    ).toEqual(['en: "tabs.home" is not a string']);
  });
});

describe("pluralForms", () => {
  it("matches each language's plural categories", () => {
    for (const [language, forms] of Object.entries(pluralForms)) {
      const categories = new Intl.PluralRules(language).resolvedOptions()
        .pluralCategories;
      expect([...forms].sort()).toEqual([...categories].sort());
    }
  });
});
