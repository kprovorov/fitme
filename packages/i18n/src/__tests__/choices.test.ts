import {
  appLanguages,
  experienceLevels,
  genders,
  goals,
  measurementSystems,
  muscleGroups,
  places,
} from "@fitme/core";
import { describe, expect, it } from "vitest";
import { catalogs } from "..";

// Every fixed choice the app shows, by its `choices` section: each section
// holds exactly core's ids, so a new enum value can't ship untranslated.
const choiceSections = {
  experienceLevel: experienceLevels,
  experienceLevelDescription: experienceLevels,
  gender: genders,
  goal: goals,
  measurementSystem: measurementSystems,
  measurementSystemDescription: measurementSystems,
  muscleGroup: muscleGroups,
  place: places,
} satisfies Record<string, readonly string[]>;

describe.each(appLanguages)("the %s catalog", (language) => {
  const choices: Record<string, Record<string, unknown>> = catalogs[language]
    .choices;

  it("has a choices section for every enum the app shows, and no other", () => {
    expect(Object.keys(choices).sort()).toEqual(
      Object.keys(choiceSections).sort()
    );
  });

  it.each(Object.entries(choiceSections))(
    "labels every %s id from core",
    (section, ids) => {
      expect(Object.keys(choices[section] ?? {}).sort()).toEqual(
        [...ids].sort()
      );
    }
  );
});
