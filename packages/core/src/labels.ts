import type {
  ExperienceLevel,
  Gender,
  Goal,
  MeasurementSystem,
  Place,
} from "./models";

export const getMeasurementSystemLabel = (
  measurementSystem: MeasurementSystem
) => {
  switch (measurementSystem) {
    case "metric": {
      return "Metric";
    }

    case "us": {
      return "US";
    }

    case "uk": {
      return "UK";
    }

    default: {
      return measurementSystem;
    }
  }
};

export const getMeasurementSystemDisclaimer = (
  measurementSystem: MeasurementSystem
) =>
  new Map<MeasurementSystem, string>([
    ["metric", "Centimeters and Kilograms"],
    ["us", "Feet, Inches and Pounds"],
    ["uk", "Feet, Inches and Pounds"],
  ]).get(measurementSystem);

export const getWeightLabel = (measurementSystem: MeasurementSystem) =>
  new Map<MeasurementSystem, string>([
    ["metric", "kg"],
    ["us", "lbs"],
    ["uk", "lbs"],
  ]).get(measurementSystem);

export const getHeightLabel = (measurementSystem: MeasurementSystem) =>
  new Map<MeasurementSystem, string>([
    ["metric", "cm"],
    ["us", "ft"],
    ["uk", "ft"],
  ]).get(measurementSystem);

export const getGenderLabel = (gender: Gender) => {
  switch (gender) {
    case "male": {
      return "Male";
    }

    case "female": {
      return "Female";
    }

    default: {
      return gender;
    }
  }
};

export const getGoalLabel = (goal: Goal) =>
  new Map<Goal, string>([
    ["fat-loss", "Lose Weight"],
    ["muscle-gain", "Gain Muscle"],
    ["recomposition", "Recomposition"],
    ["strength-performance", "Strength & Performance"],
    ["general-health-fitness", "General Health & Fitness"],
  ]).get(goal);

export const getPlaceLabel = (place: Place) =>
  new Map<Place, string>([
    ["gym", "Gym"],
    ["home", "Home"],
  ]).get(place);

export const getExperienceLevelLabel = (experienceLevel: ExperienceLevel) =>
  new Map<ExperienceLevel, string>([
    ["beginner", "Beginner"],
    ["intermediate", "Intermediate"],
    ["advanced", "Advanced"],
  ]).get(experienceLevel);

export const getExperienceLevelDisclaimer = (
  experienceLevel: ExperienceLevel
) =>
  new Map<ExperienceLevel, string>([
    ["beginner", "0-6 mo experience"],
    ["intermediate", "6 mo - 3 yrs experience"],
    ["advanced", "3+ yrs experience"],
  ]).get(experienceLevel);
