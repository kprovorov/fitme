import {
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
    case "metric":
      return "Metric";
    case "us":
      return "US";
    case "uk":
      return "UK";
  }
};

export const getMeasurementSystemDisclaimer = (
  measurementSystem: MeasurementSystem
) => {
  switch (measurementSystem) {
    case "metric":
      return "Centimeters and Kilograms";
    case "us":
      return "Feet, Inches and Pounds";
    case "uk":
      return "Feet, Inches and Pounds";
  }
};

export const getWeightLabel = (measurementSystem: MeasurementSystem) => {
  switch (measurementSystem) {
    case "metric":
      return "kg";
    case "us":
      return "lbs";
    case "uk":
      return "lbs";
  }
};

export const getHeightLabel = (measurementSystem: MeasurementSystem) => {
  switch (measurementSystem) {
    case "metric":
      return "cm";
    case "us":
      return "ft";
    case "uk":
      return "ft";
  }
};

export const getGenderLabel = (gender: Gender) => {
  switch (gender) {
    case "male":
      return "Male";
    case "female":
      return "Female";
  }
};

export const getGoalLabel = (goal: Goal) => {
  switch (goal) {
    case "fat-loss":
      return "Lose Weight";
    case "muscle-gain":
      return "Gain Muscle";
    case "recomposition":
      return "Recomposition";
    case "strength-performance":
      return "Strength & Performance";
    case "general-health-fitness":
      return "General Health & Fitness";
  }
};

export const getPlaceLabel = (place: Place) => {
  switch (place) {
    case "gym":
      return "Gym";
    case "home":
      return "Home";
  }
};

export const getExperienceLevelLabel = (experienceLevel: ExperienceLevel) => {
  switch (experienceLevel) {
    case "beginner":
      return "Beginner";
    case "intermediate":
      return "Intermediate";
    case "advanced":
      return "Advanced";
  }
};

export const getExperienceLevelDisclaimer = (
  experienceLevel: ExperienceLevel
) => {
  switch (experienceLevel) {
    case "beginner":
      return "0-6 mo experience";
    case "intermediate":
      return "6 mo - 3 yrs experience";
    case "advanced":
      return "3+ yrs experience";
  }
};
