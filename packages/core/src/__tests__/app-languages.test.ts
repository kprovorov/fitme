import { describe, expect, it } from "vitest";
import {
  appLanguages,
  defaultAppLanguage,
  isAppLanguage,
  resolveAppLanguage,
} from "../models";

describe("appLanguages", () => {
  it("lists English and Ukrainian, English the default", () => {
    expect(appLanguages).toEqual(["en", "uk"]);
    expect(defaultAppLanguage).toBe("en");
  });
});

describe("isAppLanguage", () => {
  it("accepts an App language", () => {
    expect(isAppLanguage("en")).toBe(true);
    expect(isAppLanguage("uk")).toBe(true);
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
