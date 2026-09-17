import { getWeightLabel } from "./labels";
import type { MeasurementSystem } from "./models";

export const formatWeight = (
  weight: number,
  measurementSystem: MeasurementSystem
) => `${weight} ${getWeightLabel(measurementSystem)}`;

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

export const formatWorkoutDuration = (
  startedAt: string,
  finishedAt: string
) => {
  const totalMinutes = Math.max(
    0,
    Math.round(
      (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 60_000
    )
  );
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
};
