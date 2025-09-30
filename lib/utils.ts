import { AxiosError, HttpStatusCode } from "axios";
import { FieldErrors, FieldValues } from "react-hook-form";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { ServerError } from "./api";
import { MuscleGroup } from "./models";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function handleAxiosError<T extends FieldValues>(
  error: AxiosError<ServerError<T>>,
  setMessage: (message: string) => void = () => {},
  setErrors: (errors: FieldErrors<T>) => void = () => {},
) {
  if (
    error.response?.status === HttpStatusCode.UnprocessableEntity &&
    error.response?.data.errors
  ) {
    setErrors(mapErrors(error.response.data.errors));
  } else {
    setMessage(
      error.response?.data.message ??
        "Something went wrong. Please try again later.",
    );
  }
}

export function mapErrors<T extends FieldValues>(
  errors: Record<keyof T, string[]>,
): FieldErrors<T> {
  return Object.fromEntries(
    Object.entries(errors).map(([key, value]) => [
      key,
      {
        type: "validate",
        message: value[0],
      },
    ]),
  ) as FieldErrors<T>;
}

export function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
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
  }
}
