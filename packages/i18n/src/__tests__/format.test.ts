import { describe, expect, it } from "vitest";
import { createI18n } from "..";
import {
  type CountKind,
  formatCompactVolume,
  formatCount,
  formatDuration,
  formatHeight,
  formatNumber,
  formatUnit,
  formatWeight,
  formatWorkoutDuration,
  spokenCompactVolume,
  spokenUnit,
  type Unit,
  unitName,
} from "../format";

const en = createI18n("en");
const uk = createI18n("uk");

// Intl writes Ukrainian thousands with a no-break space.
const NBSP = " ";

describe("formatCount", () => {
  const counts = [1, 2, 5, 11, 21, 22] as const;

  it.each<[CountKind, string[]]>([
    [
      "sets",
      [
        "1 підхід",
        "2 підходи",
        "5 підходів",
        "11 підходів",
        "21 підхід",
        "22 підходи",
      ],
    ],
    [
      "reps",
      [
        "1 повторення",
        "2 повторення",
        "5 повторень",
        "11 повторень",
        "21 повторення",
        "22 повторення",
      ],
    ],
    [
      "exercises",
      ["1 вправа", "2 вправи", "5 вправ", "11 вправ", "21 вправа", "22 вправи"],
    ],
    [
      "workouts",
      [
        "1 тренування",
        "2 тренування",
        "5 тренувань",
        "11 тренувань",
        "21 тренування",
        "22 тренування",
      ],
    ],
    [
      "workoutSessions",
      [
        "1 тренування",
        "2 тренування",
        "5 тренувань",
        "11 тренувань",
        "21 тренування",
        "22 тренування",
      ],
    ],
    [
      "entries",
      [
        "1 запис",
        "2 записи",
        "5 записів",
        "11 записів",
        "21 запис",
        "22 записи",
      ],
    ],
    [
      "minutes",
      [
        "1 хвилина",
        "2 хвилини",
        "5 хвилин",
        "11 хвилин",
        "21 хвилина",
        "22 хвилини",
      ],
    ],
  ])("counts %s in Ukrainian", (kind, expected) => {
    expect(counts.map((count) => formatCount(uk, kind, count))).toEqual(
      expected
    );
  });

  it.each<[CountKind, string, string]>([
    ["sets", "set", "sets"],
    ["reps", "rep", "reps"],
    ["exercises", "exercise", "exercises"],
    ["workouts", "workout", "workouts"],
    ["workoutSessions", "workout session", "workout sessions"],
    ["minutes", "minute", "minutes"],
    ["entries", "entry", "entries"],
  ])("counts %s in English", (kind, one, other) => {
    expect(counts.map((count) => formatCount(en, kind, count))).toEqual([
      `1 ${one}`,
      `2 ${other}`,
      `5 ${other}`,
      `11 ${other}`,
      `21 ${other}`,
      `22 ${other}`,
    ]);
  });

  it("formats the count for the language", () => {
    expect(formatCount(en, "reps", 1250)).toBe("1,250 reps");
    expect(formatCount(uk, "reps", 1250)).toBe(`1${NBSP}250 повторень`);
  });
});

describe("formatNumber", () => {
  it("writes a number as the language does", () => {
    expect(formatNumber(en, 62.5)).toBe("62.5");
    expect(formatNumber(uk, 62.5)).toBe("62,5");
    expect(formatNumber(en, 12_500)).toBe("12,500");
    expect(formatNumber(uk, 12_500)).toBe(`12${NBSP}500`);
  });
});

describe("units", () => {
  it.each<[Unit, string, string, string, string]>([
    ["kg", "kg", "62.5 kg", "кг", "62,5 кг"],
    ["lbs", "lbs", "62.5 lbs", "фунт", "62,5 фунт"],
    ["cm", "cm", "62.5 cm", "см", "62,5 см"],
    ["in", "in", "62.5 in", "дюйм", "62,5 дюйм"],
  ])("%s in both languages", (unit, enName, enValue, ukName, ukValue) => {
    expect(unitName(en, unit)).toBe(enName);
    expect(formatUnit(en, 62.5, unit)).toBe(enValue);
    expect(unitName(uk, unit)).toBe(ukName);
    expect(formatUnit(uk, 62.5, unit)).toBe(ukValue);
  });

  it("spells units out for VoiceOver, counted", () => {
    expect(spokenUnit(en, 1, "kg")).toBe("1 kilogram");
    expect(spokenUnit(en, 32.5, "kg")).toBe("32.5 kilograms");
    expect(spokenUnit(en, 225, "lbs")).toBe("225 pounds");
    expect(spokenUnit(uk, 1, "kg")).toBe("1 кілограм");
    expect(spokenUnit(uk, 2, "kg")).toBe("2 кілограми");
    expect(spokenUnit(uk, 5, "kg")).toBe("5 кілограмів");
    expect(spokenUnit(uk, 32.5, "kg")).toBe("32,5 кілограма");
    expect(spokenUnit(uk, 21, "lbs")).toBe("21 фунт");
    expect(spokenUnit(uk, 180, "cm")).toBe("180 сантиметрів");
    expect(spokenUnit(uk, 3, "in")).toBe("3 дюйми");
  });
});

describe("formatWeight", () => {
  it("uses the measurement system's unit, whatever the language", () => {
    expect(formatWeight(en, 70, "metric")).toBe("70 kg");
    expect(formatWeight(en, 155, "us")).toBe("155 lbs");
    expect(formatWeight(en, 155, "uk")).toBe("155 lbs");
    expect(formatWeight(uk, 62.5, "metric")).toBe("62,5 кг");
    expect(formatWeight(uk, 155, "us")).toBe("155 фунт");
  });
});

describe("formatHeight", () => {
  it("shows metric heights in centimeters", () => {
    expect(formatHeight(en, 180, "metric")).toBe("180 cm");
    expect(formatHeight(uk, 180.5, "metric")).toBe("180,5 см");
  });

  it("shows imperial heights in feet and inches", () => {
    expect(formatHeight(en, 71, "us")).toBe("5′ 11″");
    expect(formatHeight(en, 60, "us")).toBe("5′ 0″");
    expect(formatHeight(en, 71.6, "us")).toBe("6′ 0″");
    expect(formatHeight(uk, 72, "uk")).toBe("6′ 0″");
  });
});

describe("formatWorkoutDuration", () => {
  const start = "2026-10-29T10:00:00.000Z";

  it("shows minutes, then hours and minutes past an hour", () => {
    expect(formatWorkoutDuration(en, start, "2026-10-29T10:42:00.000Z")).toBe(
      "42min"
    );
    expect(formatWorkoutDuration(en, start, "2026-10-29T11:05:00.000Z")).toBe(
      "1h 5min"
    );
    expect(formatWorkoutDuration(uk, start, "2026-10-29T10:42:00.000Z")).toBe(
      "42 хв"
    );
    expect(formatWorkoutDuration(uk, start, "2026-10-29T11:05:00.000Z")).toBe(
      "1 год 5 хв"
    );
  });

  it("reads clock skew as no time at all", () => {
    expect(formatWorkoutDuration(en, start, "2026-10-29T09:00:00.000Z")).toBe(
      "0min"
    );
  });
});

describe("formatDuration", () => {
  const MINUTE_MS = 60_000;

  it("shows hours and minutes, rounded to the minute", () => {
    expect(formatDuration(en, 0)).toBe("0min");
    expect(formatDuration(en, 42 * MINUTE_MS + 20_000)).toBe("42min");
    expect(formatDuration(en, 12 * 60 * MINUTE_MS + 5 * MINUTE_MS)).toBe(
      "12h 5min"
    );
    expect(formatDuration(uk, 125 * MINUTE_MS)).toBe("2 год 5 хв");
  });

  it("reads a negative span as no time at all", () => {
    expect(formatDuration(en, -MINUTE_MS)).toBe("0min");
  });
});

describe("formatCompactVolume", () => {
  it("shows kilograms below a tonne, then tonnes to one decimal", () => {
    expect(formatCompactVolume(en, 0, "kg")).toBe("0 kg");
    expect(formatCompactVolume(en, 999.4, "kg")).toBe("999 kg");
    expect(formatCompactVolume(en, 999.6, "kg")).toBe("1 t");
    expect(formatCompactVolume(en, 1000, "kg")).toBe("1 t");
    expect(formatCompactVolume(en, 136_249, "kg")).toBe("136.2 t");
    expect(formatCompactVolume(uk, 136_249, "kg")).toBe("136,2 т");
    expect(formatCompactVolume(uk, 850, "kg")).toBe("850 кг");
    expect(formatCompactVolume(en, 1_250_000, "kg")).toBe("1,250 t");
  });

  it("shows pounds below a thousand, then thousands of pounds", () => {
    expect(formatCompactVolume(en, 0, "lbs")).toBe("0 lbs");
    expect(formatCompactVolume(en, 940, "lbs")).toBe("940 lbs");
    expect(formatCompactVolume(en, 300_420, "lbs")).toBe("300.4K lbs");
    expect(formatCompactVolume(uk, 300_420, "lbs")).toBe("300,4 тис. фунт");
  });

  it("spells the compact volume out for VoiceOver", () => {
    expect(spokenCompactVolume(en, 0, "kg")).toBe("0 kilograms");
    expect(spokenCompactVolume(en, 850, "kg")).toBe("850 kilograms");
    expect(spokenCompactVolume(en, 1000, "kg")).toBe("1 tonne");
    expect(spokenCompactVolume(en, 136_249, "kg")).toBe("136.2 tonnes");
    expect(spokenCompactVolume(uk, 5000, "kg")).toBe("5 тонн");
    expect(spokenCompactVolume(uk, 136_249, "kg")).toBe("136,2 тонни");
    expect(spokenCompactVolume(en, 300_420, "lbs")).toBe(
      "300.4 thousand pounds"
    );
    expect(spokenCompactVolume(uk, 2000, "lbs")).toBe("2 тисячі фунтів");
  });
});
