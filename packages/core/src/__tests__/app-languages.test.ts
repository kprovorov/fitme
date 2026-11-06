import { describe, expect, it } from "vitest";

import {
  appLanguages,
  defaultAppLanguage,
  isAppLanguage,
  resolveAppLanguage,
} from "../models";

describe("supported app languages", () => {
  it("lists every supported language, English the default", () => {
    expect(appLanguages).toStrictEqual(["en", "uk", "es", "ca"]);
    expect(defaultAppLanguage).toBe("en");
  });
});

describe("app language validation", () => {
  it("accepts an App language", () => {
    expect(isAppLanguage("en")).toBeTruthy();
    expect(isAppLanguage("uk")).toBeTruthy();
    expect(isAppLanguage("es")).toBeTruthy();
    expect(isAppLanguage("ca")).toBeTruthy();
  });

  it("refuses anything else", () => {
    expect(isAppLanguage("ru")).toBeFalsy();
    expect(isAppLanguage("uk-UA")).toBeFalsy();
    expect(isAppLanguage("")).toBeFalsy();
    expect(isAppLanguage(undefined)).toBeFalsy();
  });
});

describe("device language resolution", () => {
  it("picks Ukrainian with or without a region", () => {
    expect(resolveAppLanguage(["uk"])).toBe("uk");
    expect(resolveAppLanguage(["uk-UA"])).toBe("uk");
  });

  it.each([
    ["es", "es"],
    ["es-ES", "es"],
    ["es-MX", "es"],
    ["es-419", "es"],
    ["ca", "ca"],
    ["ca-ES", "ca"],
    ["ca-ES-valencia", "ca"],
    ["CA_es", "ca"],
  ])("resolves %s to %s", (tag, language) => {
    expect(resolveAppLanguage([tag])).toBe(language);
  });

  it("respects Spanish and Catalan device preference order", () => {
    expect(resolveAppLanguage(["fr-FR", "ca-ES", "es-ES"])).toBe("ca");
    expect(resolveAppLanguage(["es-MX", "ca-ES", "en"])).toBe("es");
  });

  it("picks English with a region", () => {
    expect(resolveAppLanguage(["en-GB"])).toBe("en");
  });

  it("gives an unsupported language English, never another language", () => {
    expect(resolveAppLanguage(["ru"])).toBe("en");
    expect(resolveAppLanguage(["ru-RU"])).toBe("en");
    expect(resolveAppLanguage(["de"])).toBe("en");
    expect(resolveAppLanguage(["de-DE"])).toBe("en");
  });

  it("gives an empty list English", () => {
    expect(resolveAppLanguage([])).toBe("en");
  });

  it("picks the first supported language in order", () => {
    expect(resolveAppLanguage(["de-DE", "uk-UA"])).toBe("uk");
    expect(resolveAppLanguage(["de-DE", "en-US", "uk-UA"])).toBe("en");
  });

  it("compares the language subtag case-insensitively", () => {
    expect(resolveAppLanguage(["UK-ua"])).toBe("uk");
    expect(resolveAppLanguage(["uk_UA"])).toBe("uk");
  });
});
