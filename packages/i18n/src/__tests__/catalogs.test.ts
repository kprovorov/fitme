import { appLanguages } from "@fitme/core";
import { describe, expect, it } from "vitest";

import { catalogs, checkCatalogs } from "..";

describe("translation catalogs", () => {
  it("has a catalog for every App language", () => {
    expect(Object.keys(catalogs).toSorted()).toStrictEqual(
      appLanguages.toSorted()
    );
  });

  // The translation check behind AI-written translations: every key in every
  // catalog, every plural form each language needs, no empty value.
  it("passes the translation check", () => {
    expect(checkCatalogs(catalogs)).toStrictEqual([]);
  });

  // The Language row shows the App language in its own name, whatever
  // language the app is in, so the section is the same in every catalog.
  it("names every App language by its own name, the same in every catalog", () => {
    const { languages } = catalogs.en;

    expect(Object.keys(languages).toSorted()).toStrictEqual(
      appLanguages.toSorted()
    );
    expect(languages.uk).toBe("Українська");

    for (const language of appLanguages) {
      expect(catalogs[language].languages).toStrictEqual(languages);
    }
  });
});
