import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { MuscleGroup } from "./models";
import { useSharedValue } from "react-native-reanimated";
import {
  NativeEvent,
  useKeyboardHandler,
} from "react-native-keyboard-controller";
import { NativeComponentRegistry } from "react-native";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function handleSupabaseError(
  error: Error | { message?: string } | unknown,
  setMessage: (message: string) => void = () => {},
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

export const useGradualAnimation = () => {
  const height = useSharedValue(0);

  useKeyboardHandler(
    {
      onMove: (event: NativeEvent) => {
        "worklet";
        height.value = Math.max(event.height, 0);
      },
    },
    [],
  );
  return { height };
};
