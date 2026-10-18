import { getWeightLabel } from "./labels";
import type { MeasurementSystem } from "./models";
import { inchesToFeetAndInches } from "./utils";

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
  const { feet, inches } = inchesToFeetAndInches(height);
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

/**
 * A running or finished workout's length as a clock: `42:17`, or `1:04:12`
 * past an hour. Negative durations (clock skew) read as `0:00`.
 */
export const formatElapsed = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => value.toString().padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
};
