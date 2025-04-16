import { MeasurementSystem } from "./models";

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
