import { describe, expect, it } from "vitest";
import { createI18n } from "..";

describe("createI18n", () => {
  it("translates in English", () => {
    const i18n = createI18n("en");
    expect(i18n.language).toBe("en");
    expect(i18n.t("tabs.home")).toBe("Home");
    expect(i18n.t("counts.sets", { count: 1 })).toBe("1 set");
    expect(i18n.t("counts.sets", { count: 3 })).toBe("3 sets");
  });

  it("translates in Ukrainian, with every plural form", () => {
    const i18n = createI18n("uk");
    expect(i18n.language).toBe("uk");
    expect(i18n.t("tabs.home")).toBe("Головна");
    expect(i18n.t("counts.sets", { count: 1 })).toBe("1 підхід");
    expect(i18n.t("counts.sets", { count: 21 })).toBe("21 підхід");
    expect(i18n.t("counts.sets", { count: 3 })).toBe("3 підходи");
    expect(i18n.t("counts.sets", { count: 5 })).toBe("5 підходів");
    expect(i18n.t("counts.sets", { count: 11 })).toBe("11 підходів");
    expect(i18n.t("counts.sets", { count: 1.5 })).toBe("1,5 підходу");
  });

  it("is ready at once, with nothing loaded later", () => {
    expect(createI18n("uk").isInitialized).toBe(true);
  });

  it("falls back to English for a key missing in Ukrainian, never the raw key", () => {
    const i18n = createI18n("uk");
    i18n.addResource("en", "translation", "onlyInEnglish", "Only in English");
    expect(i18n.t("onlyInEnglish" as "tabs.home")).toBe("Only in English");
  });

  it("keeps each instance's language its own", () => {
    const en = createI18n("en");
    createI18n("uk");
    expect(en.t("tabs.home")).toBe("Home");
  });

  it("types its keys", () => {
    const i18n = createI18n("en");
    // @ts-expect-error: an unknown key is a type error
    i18n.t("tabs.hmoe");
    // @ts-expect-error: a plural is asked for by its key, never by a typo of it
    i18n.t("counts.set", { count: 1 });
    expect(i18n.t("profile.title")).toBe("Profile");
  });
});
