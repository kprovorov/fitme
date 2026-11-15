import type { ExperienceLevel, Goal, MeasurementSystem, Place } from "./models";

export const getWeightLabel = (measurementSystem: MeasurementSystem) =>
  new Map<MeasurementSystem, string>([
    ["metric", "kg"],
    ["us", "lbs"],
    ["uk", "lbs"],
  ]).get(measurementSystem);

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
