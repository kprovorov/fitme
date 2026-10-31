import { describe, expect, it } from "vitest";
import { createI18n } from "..";
import {
  formatDate,
  formatLocale,
  formatNumber,
  formatTime,
  setDeviceConventions,
} from "../format";

/** An instance in an App language, on a device with a region and a clock. */
const on = (
  language: "en" | "uk",
  region: string | null,
  uses24hourClock: boolean | null = null
) => {
  const instance = createI18n(language);
  setDeviceConventions(instance, { region, uses24hourClock });
  return instance;
};

// A 12-hour Ukrainian time: `6:05 пп`, whatever space ICU puts before it.
const SIX_OH_FIVE_12_HOUR = /^6:05\s/;

// 2026-10-21 18:05, local time.
const evening = new Date(2026, 9, 21, 18, 5);

describe("formatLocale", () => {
  it("is the App language plus the device region", () => {
    expect(formatLocale(on("uk", "UA"))).toBe("uk-UA");
    expect(formatLocale(on("en", "GB"))).toBe("en-GB");
    // A Ukrainian speaker in Poland: Ukrainian words, Polish conventions.
    expect(formatLocale(on("uk", "PL"))).toBe("uk-PL");
  });

  it("is the App language alone without a usable region", () => {
    expect(formatLocale(createI18n("uk"))).toBe("uk");
    expect(formatLocale(on("en", null))).toBe("en");
    expect(formatLocale(on("en", "not a region"))).toBe("en");
  });

  it("reads the instance's device through a copy or view of it", () => {
    const instance = on("uk", "UA");
    // react-i18next's copy of the instance, and a view inheriting from it.
    const copy = Object.create(instance, { __original: { value: instance } });
    expect(formatLocale(copy)).toBe("uk-UA");
    expect(formatLocale(Object.create(copy))).toBe("uk-UA");
    expect(formatLocale(Object.create(instance))).toBe("uk-UA");
  });

  it("follows the App language when it changes", async () => {
    const instance = on("en", "UA");
    await instance.changeLanguage("uk");
    expect(formatLocale(instance)).toBe("uk-UA");
  });
});

describe("formatDate", () => {
  it("writes a Ukrainian date with a Ukrainian month, day before month", () => {
    const uk = on("uk", "UA");
    expect(formatDate(uk, evening, "dayMonth")).toBe("21 жовтня");
    expect(formatDate(uk, evening, "dayMonthYear")).toBe("21 жовтня 2026 р.");
    expect(formatDate(uk, evening, "monthYear")).toBe("жовтень 2026 р.");
    expect(formatDate(uk, evening, "shortDayMonth")).toBe("21 жовт.");
  });

  it("orders an English date the device region's way", () => {
    expect(formatDate(on("en", "US"), evening, "dayMonth")).toBe("October 21");
    expect(formatDate(on("en", "GB"), evening, "dayMonth")).toBe("21 October");
    expect(formatDate(on("en", "US"), evening, "shortDayMonth")).toBe("Oct 21");
    expect(formatDate(on("en", "GB"), evening, "shortDayMonth")).toBe("21 Oct");
    expect(formatDate(on("en", "US"), evening, "weekdayDayMonthYear")).toBe(
      "Wed, Oct 21, 2026"
    );
    expect(formatDate(on("en", "US"), evening, "monthYear")).toBe(
      "October 2026"
    );
  });

  it("follows a language change", async () => {
    const instance = on("en", "UA");
    expect(formatDate(instance, evening, "dayMonth")).toBe("21 October");
    await instance.changeLanguage("uk");
    expect(formatDate(instance, evening, "dayMonth")).toBe("21 жовтня");
  });
});

describe("formatTime", () => {
  it("follows the device's 24-hour setting, whatever the language", () => {
    expect(formatTime(on("en", "US", true), evening)).toBe("18:05");
    expect(formatTime(on("en", "US", false), evening)).toBe("6:05 PM");
    expect(formatTime(on("uk", "UA", true), evening)).toBe("18:05");
    expect(formatTime(on("uk", "UA", false), evening)).toMatch(
      SIX_OH_FIVE_12_HOUR
    );
  });

  it("follows the device into another time zone while the app stays open", () => {
    const zone = process.env.TZ;
    const instance = on("en", "GB", true);
    const noonUtc = new Date(Date.UTC(2026, 9, 21, 12, 0));
    try {
      process.env.TZ = "UTC";
      expect(formatTime(instance, noonUtc)).toBe("12:00");
      process.env.TZ = "Asia/Tokyo";
      expect(formatTime(instance, noonUtc)).toBe("21:00");
    } finally {
      process.env.TZ = zone;
    }
  });

  it("takes the locale's own clock when the device doesn't say", () => {
    expect(formatTime(on("en", "US"), evening)).toBe("6:05 PM");
    expect(formatTime(on("uk", "UA"), evening)).toBe("18:05");
  });
});

describe("numbers with a region", () => {
  it("writes 62.5 the App language's way", () => {
    expect(formatNumber(on("uk", "UA"), 62.5)).toBe("62,5");
    expect(formatNumber(on("en", "US"), 62.5)).toBe("62.5");
  });

  it("takes the region's separators, in the catalogs' numbers too", () => {
    // English in Germany writes a decimal comma, as the device does.
    const instance = on("en", "DE");
    expect(formatNumber(instance, 62.5)).toBe("62,5");
    expect(instance.t("units.kg", { value: 62.5 })).toBe("62,5 kg");
    expect(on("en", "US").t("units.kg", { value: 62.5 })).toBe("62.5 kg");
  });
});
