import { getWeightLabel } from "./labels";
import type { MeasurementSystem } from "./models";

export const formatWeight = (
  weight: number,
  measurementSystem: MeasurementSystem
) => {
  return `${weight} ${getWeightLabel(measurementSystem)}`;
};

export const formatHeight = (
  height: number,
  measurementSystem: MeasurementSystem
) => {
  if (measurementSystem === "metric") {
    return `${height} cm`;
  }
  const feet = Math.floor(height / 12);
  const inches = Math.round(height % 12);
  return `${feet}′ ${inches}″`;
};
