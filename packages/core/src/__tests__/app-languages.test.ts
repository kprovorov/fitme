import { describe, expect, it } from "vitest";

import {
  appLanguages,
  defaultAppLanguage,
  isAppLanguage,
  resolveAppLanguage,
} from "../models";

describe("supported app languages", () => {
  it("lists every supported language, English the default", () => {
    expect(appLanguages).toStrictEqual([
      "en",
      "uk",
      "es",
      "ca",
      "fr",
      "de",
      "it",
      "pt-BR",
      "pt-PT",
      "pl",
      "zh-Hans",
      "zh-Hant",
      "ja",
      "ko",
      "nl",
    ]);
    expect(defaultAppLanguage).toBe("en");
  });
});

describe("app language validation", () => {
  it.each(appLanguages)("accepts %s", (language) => {
    expect(isAppLanguage(language)).toBeTruthy();
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
    ["fr-FR", "fr"],
    ["fr-CA", "fr"],
    ["de-DE", "de"],
    ["it-IT", "it"],
    ["pt-BR", "pt-BR"],
    ["pt-PT", "pt-PT"],
    ["pl-PL", "pl"],
    ["zh-Hans-CN", "zh-Hans"],
    ["zh-Hant-TW", "zh-Hant"],
    ["zh-CN", "zh-Hans"],
    ["zh-TW", "zh-Hant"],
    ["zh-HK", "zh-Hant"],
    ["zh-MO", "zh-Hant"],
    ["zh-SG", "zh-Hans"],
    ["zh-Hans-TW", "zh-Hans"],
    ["zh-Hant-CN", "zh-Hant"],
    ["pt", "pt-BR"],
    ["PT_pt", "pt-PT"],
    ["pt-Latn-PT", "pt-PT"],
    ["zh", "zh-Hans"],
    ["ja-JP", "ja"],
    ["ko-KR", "ko"],
    ["nl-NL", "nl"],
    ["nl-BE", "nl"],
  ])("resolves %s to %s", (tag, language) => {
    expect(resolveAppLanguage([tag])).toBe(language);
  });

  it("respects Spanish and Catalan device preference order", () => {
    expect(resolveAppLanguage(["ru-RU", "ca-ES", "es-ES"])).toBe("ca");
    expect(resolveAppLanguage(["es-MX", "ca-ES", "en"])).toBe("es");
  });

  it("respects the newly supported languages in preference order", () => {
    expect(resolveAppLanguage(["fr-CA", "ca-ES"])).toBe("fr");
    expect(resolveAppLanguage(["ru-RU", "ja-JP", "de-DE"])).toBe("ja");
  });

  it("picks English with a region", () => {
    expect(resolveAppLanguage(["en-GB"])).toBe("en");
  });

  it("gives an unsupported language English, never another language", () => {
    expect(resolveAppLanguage(["ru"])).toBe("en");
    expect(resolveAppLanguage(["ru-RU"])).toBe("en");
    expect(resolveAppLanguage(["sv"])).toBe("en");
    expect(resolveAppLanguage(["sv-SE"])).toBe("en");
  });

  it("gives an empty list English", () => {
    expect(resolveAppLanguage([])).toBe("en");
  });

  it("picks the first supported language in order", () => {
    expect(resolveAppLanguage(["sv-SE", "uk-UA"])).toBe("uk");
    expect(resolveAppLanguage(["sv-SE", "en-US", "uk-UA"])).toBe("en");
  });

  it("compares the language subtag case-insensitively", () => {
    expect(resolveAppLanguage(["UK-ua"])).toBe("uk");
    expect(resolveAppLanguage(["uk_UA"])).toBe("uk");
  });
});
