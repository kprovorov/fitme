import {
  appLanguages,
  difficulties,
  equipment,
  experienceLevels,
  genders,
  goals,
  legacyEquipment,
  legacyMuscleGroups,
  measurementSystems,
  movementPatterns,
  muscleGroups,
  places,
} from "@fitme/core";
import { describe, expect, it } from "vitest";

import { catalogs } from "..";

// Each id once, for a section naming both a legacy list and its new one.
const union = (...lists: readonly (readonly string[])[]): string[] => [
  ...new Set(lists.flat()),
];

// Every fixed choice the app shows, by its `choices` section: each section
// holds exactly core's ids, so a new enum value can't ship untranslated. The
// muscle groups and Equipment name the Legacy Library's ids and the new
// Library's alike (ADR 0022): older content and older builds still show the
// legacy ones.
const choiceSections = {
  difficulty: difficulties,
  equipment: union(legacyEquipment, equipment),
  experienceLevel: experienceLevels,
  experienceLevelDescription: experienceLevels,
  gender: genders,
  goal: goals,
  measurementSystem: measurementSystems,
  measurementSystemDescription: measurementSystems,
  movementPattern: movementPatterns,
  muscleGroup: union(legacyMuscleGroups, muscleGroups),
  place: places,
} satisfies Record<string, readonly string[]>;

describe.each(appLanguages)("the %s catalog", (language) => {
  const choices: Record<
    string,
    (typeof catalogs)[typeof language]["choices"][keyof typeof choiceSections]
  > = catalogs[language].choices;

  it("has a choices section for every enum the app shows, and no other", () => {
    expect(Object.keys(choices).toSorted()).toStrictEqual(
      Object.keys(choiceSections).toSorted()
    );
  });

  it.each(Object.entries(choiceSections))(
    "labels every %s id from core",
    (section, ids) => {
      expect(Object.keys(choices[section] ?? {}).toSorted()).toStrictEqual(
        [...ids].toSorted()
      );
    }
  );
});
