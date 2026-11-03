import { describe, expect, it } from "vitest";
import {
  appLanguages,
  defaultAppLanguage,
  isAppLanguage,
  resolveAppLanguage,
} from "../models";

describe("appLanguages", () => {
  it("lists every supported language, English the default", () => {
    expect(appLanguages).toEqual(["en", "uk", "es", "ca"]);
    expect(defaultAppLanguage).toBe("en");
  });
});

describe("isAppLanguage", () => {
  it("accepts an App language", () => {
    expect(isAppLanguage("en")).toBe(true);
    expect(isAppLanguage("uk")).toBe(true);
    expect(isAppLanguage("es")).toBe(true);
    expect(isAppLanguage("ca")).toBe(true);
  });

  it("refuses anything else", () => {
    expect(isAppLanguage("ru")).toBe(false);
    expect(isAppLanguage("uk-UA")).toBe(false);
    expect(isAppLanguage("")).toBe(false);
    expect(isAppLanguage(undefined)).toBe(false);
  });
});

describe("resolveAppLanguage", () => {
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
