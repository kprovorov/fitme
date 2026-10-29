import { appLanguages } from "@fitme/core";
import { expect, it } from "vitest";
import { catalogs, checkCatalogs } from "..";

it("has a catalog for every App language", () => {
  expect(Object.keys(catalogs).sort()).toEqual([...appLanguages].sort());
});

// The translation check behind AI-written translations: every key in every
// catalog, every plural form each language needs, no empty value.
it("passes the translation check", () => {
  expect(checkCatalogs(catalogs)).toEqual([]);
});
