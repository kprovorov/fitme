import type { MuscleGroup } from "./models";

export function handleSupabaseError(
  error: Error | { message?: string } | unknown,
  setMessage: (message: string) => void = () => {
    /* noop */
  }
) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : undefined;
  setMessage(message ?? "Something went wrong. Please try again later.");
}

export function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

const INCHES_PER_FOOT = 12;

/** Splits a total height in inches into whole feet and inches, rounding to the nearest inch. */
export function inchesToFeetAndInches(totalInches: number): {
  feet: number;
  inches: number;
} {
  const rounded = Math.round(totalInches);
  return {
    feet: Math.floor(rounded / INCHES_PER_FOOT),
    inches: rounded % INCHES_PER_FOOT,
  };
}

export function feetAndInchesToInches(feet: number, inches: number): number {
  return feet * INCHES_PER_FOOT + inches;
}

export function muscleGroupToName(muscleGroup: MuscleGroup): string {
  switch (muscleGroup) {
    case "chest":
      return "Chest";
    case "back":
      return "Back";
    case "shoulders":
      return "Shoulders";
    case "biceps":
      return "Biceps";
    case "triceps":
      return "Triceps";
    case "forearms":
      return "Forearms";
    case "abs":
      return "Abs";
    case "obliques":
      return "Obliques";
    case "quadriceps":
      return "Quadriceps";
    case "hamstrings":
      return "Hamstrings";
    case "glutes":
      return "Glutes";
    case "calves":
      return "Calves";
    case "traps":
      return "Traps";
    case "lats":
      return "Lats";
    case "lower-back":
      return "Lower Back";
    case "cardio":
      return "Cardio";
    case "full-body":
      return "Full Body";
    default:
      return muscleGroup;
  }
}
