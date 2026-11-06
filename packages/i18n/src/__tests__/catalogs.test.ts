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
});
