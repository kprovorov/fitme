import { describe, expect, it } from "vitest";
import {
  createI18n,
  formatDate,
  formatNumber,
  formatTime,
  setDeviceConventions,
  spokenUnit,
} from "..";

describe("createI18n", () => {
  it("translates in English", () => {
    const i18n = createI18n("en");
    expect(i18n.language).toBe("en");
    expect(i18n.t("tabs.workout")).toBe("Workout");
    expect(i18n.t("counts.sets", { count: 1 })).toBe("1 set");
    expect(i18n.t("counts.sets", { count: 3 })).toBe("3 sets");
  });

  it("translates in Ukrainian, with every plural form", () => {
    const i18n = createI18n("uk");
    expect(i18n.language).toBe("uk");
    expect(i18n.t("tabs.workout")).toBe("Тренування");
    expect(i18n.t("counts.sets", { count: 1 })).toBe("1 підхід");
    expect(i18n.t("counts.sets", { count: 21 })).toBe("21 підхід");
    expect(i18n.t("counts.sets", { count: 3 })).toBe("3 підходи");
    expect(i18n.t("counts.sets", { count: 5 })).toBe("5 підходів");
    expect(i18n.t("counts.sets", { count: 11 })).toBe("11 підходів");
    expect(i18n.t("counts.sets", { count: 1.5 })).toBe("1,5 підходу");
  });

  it.each([
    {
      fraction: "1,5 series",
      language: "es" as const,
      month: "enero de 2026",
      one: "1 serie",
      other: "2 series",
      spoken: "2 kilogramos",
      tab: "Entrenamiento",
    },
    {
      fraction: "1,5 sèries",
      language: "ca" as const,
      month: "gener del 2026",
      one: "1 sèrie",
      other: "2 sèries",
      spoken: "2 quilograms",
      tab: "Entrenament",
    },
  ])(
    "translates and formats in $language",
    ({ language, tab, one, other, fraction, spoken, month }) => {
      const i18n = createI18n(language);
      setDeviceConventions(i18n, { region: "ES", uses24hourClock: true });
      expect(i18n.t("tabs.workout")).toBe(tab);
      expect(i18n.t("counts.sets", { count: 1 })).toBe(one);
      expect(i18n.t("counts.sets", { count: 2 })).toBe(other);
      expect(i18n.t("counts.sets", { count: 1.5 })).toBe(fraction);
      expect(i18n.t("counts.sets", { count: 1_000_000 })).toContain(
        language === "es" ? "series" : "sèries"
      );
      expect(formatNumber(i18n, 62.5)).toBe("62,5");
      expect(spokenUnit(i18n, 2, "kg")).toBe(spoken);
      const date = new Date(2026, 0, 15, 18, 5);
      expect(formatDate(i18n, date, "monthYear")).toBe(month);
      expect(formatTime(i18n, date)).toBe("18:05");
    }
  );

  it("is ready at once, with nothing loaded later", () => {
    expect(createI18n("uk").isInitialized).toBe(true);
  });

  it("falls back to English for a key missing in Ukrainian, never the raw key", () => {
    const i18n = createI18n("uk");
    i18n.addResource("en", "translation", "onlyInEnglish", "Only in English");
    expect(i18n.t("onlyInEnglish" as "tabs.workout")).toBe("Only in English");
  });

  it("keeps each instance's language its own", () => {
    const en = createI18n("en");
    createI18n("uk");
    expect(en.t("tabs.workout")).toBe("Workout");
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
