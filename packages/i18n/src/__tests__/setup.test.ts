import { describe, expect, it } from "vitest";

import {
  createI18n,
  formatDate,
  formatNumber,
  formatTime,
  setDeviceConventions,
  spokenUnit,
} from "..";

describe("i18n setup", () => {
  it("translates in English", () => {
    const i18n = createI18n("en");
    expect(i18n.language).toBe("en");
    expect(i18n.t("tabs.workout")).toBe("Workout");
    expect(i18n.t("counts.sets", { count: 1 })).toBe("1 set");
    expect(i18n.t("counts.sets", { count: 3 })).toBe("3 sets");
  });

  it("translates in Ukrainian, with every plural form", () => {
    const i18n = createI18n("uk");
    expect({
      language: i18n.language,
      tab: i18n.t("tabs.workout"),
      sets: [1, 21, 3, 5, 11, 1.5].map((count) =>
        i18n.t("counts.sets", { count })
      ),
    }).toStrictEqual({
      language: "uk",
      tab: "Тренування",
      sets: [
        "1 підхід",
        "21 підхід",
        "3 підходи",
        "5 підходів",
        "11 підходів",
        "1,5 підходу",
      ],
    });
  });

  it.each([
    {
      fraction: "1,5 series",
      language: "es" as const,
      month: "enero de 2026",
      one: "1 serie",
      other: "2 series",
      spoken: "2 kilogramos",
      tab: "Entreno",
    },
    {
      fraction: "1,5 sèries",
      language: "ca" as const,
      month: "gener del 2026",
      one: "1 sèrie",
      other: "2 sèries",
      spoken: "2 quilograms",
      tab: "Entrena",
    },
  ])(
    "translates and formats in $language",
    ({ language, tab, one, other, fraction, spoken, month }) => {
      const i18n = createI18n(language);
      setDeviceConventions(i18n, { region: "ES", uses24hourClock: true });
      expect(i18n.t("tabs.workout")).toBe(tab);
      expect(
        [1, 2, 1.5].map((count) => i18n.t("counts.sets", { count }))
      ).toStrictEqual([one, other, fraction]);
      expect(i18n.t("counts.sets", { count: 1_000_000 })).toContain(
        language === "es" ? "series" : "sèries"
      );
      const date = new Date(2026, 0, 15, 18, 5);
      expect({
        month: formatDate(i18n, date, "monthYear"),
        number: formatNumber(i18n, 62.5),
        spoken: spokenUnit(i18n, 2, "kg"),
        time: formatTime(i18n, date),
      }).toStrictEqual({ month, number: "62,5", spoken, time: "18:05" });
    }
  );

  it("is ready at once, with nothing loaded later", () => {
    expect(createI18n("uk").isInitialized).toBeTruthy();
  });

  it("falls back to English for a key missing in Ukrainian, never the raw key", () => {
    const i18n = createI18n("uk");
    i18n.addResource("en", "translation", "onlyInEnglish", "Only in English");
    // @ts-expect-error: this fallback key is added at runtime, outside the catalog.
    expect(i18n.t("onlyInEnglish")).toBe("Only in English");
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

// The Attachment strings (FIT-576): a photo's spoken label carries its
// position, never a `count`, so i18next's plural handling leaves it alone;
// the two limit messages are plurals, and each language picks its own form.
describe("the Attachment strings", () => {
  it.each([
    {
      conversationFull:
        "This conversation has reached 10 photos. Start a new conversation to send more.",
      language: "en" as const,
      perMessageLimit: "You can add up to 4 photos to a message.",
      pickedPhoto: "Photo 2 of 3",
    },
    {
      conversationFull:
        "У цій розмові вже 10 фото. Почніть нову розмову, щоб надіслати більше.",
      language: "uk" as const,
      perMessageLimit: "В одне повідомлення можна додати не більше 4 фото.",
      pickedPhoto: "Фото 2 з 3",
    },
    {
      conversationFull:
        "Esta conversación ya tiene 10 fotos. Empieza una nueva conversación para enviar más.",
      language: "es" as const,
      perMessageLimit: "Puedes añadir hasta 4 fotos a un mensaje.",
      pickedPhoto: "Foto 2 de 3",
    },
    {
      conversationFull:
        "Aquesta conversa ja té 10 fotos. Comença una conversa nova per enviar-ne més.",
      language: "ca" as const,
      perMessageLimit: "Pots afegir fins a 4 fotos a un missatge.",
      pickedPhoto: "Foto 2 de 3",
    },
  ])(
    "reads in $language",
    ({ language, pickedPhoto, perMessageLimit, conversationFull }) => {
      const i18n = createI18n(language);
      expect(
        i18n.t("arnold.attachments.pickedPhoto", { position: 2, total: 3 })
      ).toBe(pickedPhoto);
      expect(i18n.t("arnold.attachments.perMessageLimit", { count: 4 })).toBe(
        perMessageLimit
      );
      expect(i18n.t("arnold.attachments.conversationFull", { count: 10 })).toBe(
        conversationFull
      );
    }
  );
});
