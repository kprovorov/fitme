import type { MuscleGroup } from "@fitme/core";
import { describe, expect, it } from "@jest/globals";
import { act, renderHook } from "@testing-library/react-native";
import { englishChoiceLabels, useChoiceLabels } from "~/lib/choices";
import { useAppLanguageSync } from "~/lib/i18n";
import { setDeviceLanguages } from "~/test-utils/device-locales";

const useLabels = () => {
  useAppLanguageSync();
  return useChoiceLabels();
};

describe("useChoiceLabels", () => {
  it("labels each fixed choice in English on an English device", async () => {
    const { result } = await renderHook(useLabels);

    expect(result.current.muscleGroup("lower-back")).toBe("Lower Back");
    expect(result.current.goal("fat-loss")).toBe("Lose Weight");
    expect(result.current.place("gym")).toBe("Gym");
    expect(result.current.experienceLevel("beginner")).toBe("Beginner");
    expect(result.current.experienceLevelDescription("advanced")).toBe(
      "3+ yrs experience"
    );
    expect(result.current.gender("female")).toBe("Female");
    expect(result.current.measurementSystem("us")).toBe("US");
    expect(result.current.measurementSystemDescription("metric")).toBe(
      "Centimeters and Kilograms"
    );
  });

  it("labels each fixed choice in Ukrainian on a Ukrainian device", async () => {
    setDeviceLanguages(["uk-UA"]);
    const { result } = await renderHook(useLabels);

    expect(result.current.muscleGroup("lower-back")).toBe("Поперек");
    expect(result.current.goal("fat-loss")).toBe("Схуднення");
    expect(result.current.place("gym")).toBe("Спортзал");
    expect(result.current.experienceLevel("beginner")).toBe("Початківець");
    expect(result.current.gender("female")).toBe("Жінка");
    expect(result.current.measurementSystem("metric")).toBe("Метрична");
  });

  it("follows a change of the App language", async () => {
    const { result } = await renderHook(useLabels);
    expect(result.current.muscleGroup("chest")).toBe("Chest");

    await act(() => setDeviceLanguages(["uk-UA"]));

    expect(result.current.muscleGroup("chest")).toBe("Груди");
  });

  it("shows an id the catalogs don't have as itself", async () => {
    const { result } = await renderHook(useLabels);

    expect(result.current.muscleGroup("neck" as MuscleGroup)).toBe("neck");
  });

  it("shows an id holding a key separator as itself", async () => {
    const { result } = await renderHook(useLabels);

    expect(result.current.muscleGroup("upper.back" as MuscleGroup)).toBe(
      "upper.back"
    );
    expect(result.current.muscleGroup("x:y" as MuscleGroup)).toBe("x:y");
  });
});

describe("englishChoiceLabels", () => {
  it("labels in English whatever the App language", async () => {
    setDeviceLanguages(["uk-UA"]);
    await renderHook(useLabels);

    expect(englishChoiceLabels().goal("fat-loss")).toBe("Lose Weight");
  });
});
