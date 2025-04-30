import { Gender, Goal, MeasurementSystem, Place } from "./models";

export const getMeasurementSystemLabel = (
  measurementSystem: MeasurementSystem
) => {
  switch (measurementSystem) {
    case "METRIC":
      return "Metric";
    case "US":
      return "US";
    case "UK":
      return "UK";
  }
};

export const getMeasurementSystemDisclaimer = (
  measurementSystem: MeasurementSystem
) => {
  switch (measurementSystem) {
    case "METRIC":
      return "Centimeters and Kilograms";
    case "US":
      return "Feet, Inches and Pounds";
    case "UK":
      return "Feet, Inches and Pounds";
  }
};

export const getWeightLabel = (measurementSystem: MeasurementSystem) => {
  switch (measurementSystem) {
    case "METRIC":
      return "kg";
    case "US":
      return "lbs";
    case "UK":
      return "lbs";
  }
};

export const getHeightLabel = (measurementSystem: MeasurementSystem) => {
  switch (measurementSystem) {
    case "METRIC":
      return "cm";
    case "US":
      return "ft";
    case "UK":
      return "ft";
  }
};

export const getGenderLabel = (gender: Gender) => {
  switch (gender) {
    case "MALE":
      return "Male";
    case "FEMALE":
      return "Female";
  }
};

export const getGoalLabel = (goal: Goal) => {
  switch (goal) {
    case "FAT_LOSS":
      return "Lose Weight";
    case "MUSCLE_GAIN":
      return "Gain Muscle";
    case "RECOMPOSITION":
      return "Recomposition";
    case "STRENGTH_PERFORMANCE":
      return "Strength & Performance";
    case "GENERAL_HEALTH_FITNESS":
      return "General Health & Fitness";
  }
};

export const getPlaceLabel = (place: Place) => {
  switch (place) {
    case "GYM":
      return "Gym";
    case "HOME":
      return "Home";
  }
};
