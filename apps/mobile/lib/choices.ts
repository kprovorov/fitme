import type {
  ExperienceLevel,
  Gender,
  Goal,
  MeasurementSystem,
  MuscleGroup,
  Place,
} from "@fitme/core";
import type { TFunction } from "i18next";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { i18n } from "~/lib/i18n";

/**
 * The fixed choices the app shows, each id turned into its label in the App
 * language from the catalogs' `choices` section. Core's English labels are
 * data for the servers; the app never shows them.
 */
export interface ChoiceLabels {
  experienceLevel: (id: ExperienceLevel) => string;
  experienceLevelDescription: (id: ExperienceLevel) => string;
  gender: (id: Gender) => string;
  goal: (id: Goal) => string;
  measurementSystem: (id: MeasurementSystem) => string;
  measurementSystemDescription: (id: MeasurementSystem) => string;
  muscleGroup: (id: MuscleGroup) => string;
  place: (id: Place) => string;
}

/**
 * The labels through a `t`. An id the catalogs don't have (a muscle group the
 * Library added after this build) shows as itself, never as a raw key.
 */
export const choiceLabels = (t: TFunction): ChoiceLabels => ({
  experienceLevel: (id) =>
    t(`choices.experienceLevel.${id}`, { defaultValue: id }),
  experienceLevelDescription: (id) =>
    t(`choices.experienceLevelDescription.${id}`, { defaultValue: id }),
  gender: (id) => t(`choices.gender.${id}`, { defaultValue: id }),
  goal: (id) => t(`choices.goal.${id}`, { defaultValue: id }),
  measurementSystem: (id) =>
    t(`choices.measurementSystem.${id}`, { defaultValue: id }),
  measurementSystemDescription: (id) =>
    t(`choices.measurementSystemDescription.${id}`, { defaultValue: id }),
  muscleGroup: (id) => t(`choices.muscleGroup.${id}`, { defaultValue: id }),
  place: (id) => t(`choices.place.${id}`, { defaultValue: id }),
});

/** The fixed choices' labels in the App language, following a change of it. */
export function useChoiceLabels(): ChoiceLabels {
  // The app's instance, named so it's started wherever this is rendered.
  const { t } = useTranslation(undefined, { i18n });
  return useMemo(() => choiceLabels(t), [t]);
}
