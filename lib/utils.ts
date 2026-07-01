import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import type { MuscleGroup } from "./models";

// tailwind-merge doesn't know about our custom HIG-named font-size scale
// (defined in global.css) and misclassifies it as text-color, which
// collides with and strips text-foreground/text-primary/etc. Registering
// the scale here keeps both utilities.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "caption-2",
            "caption-1",
            "footnote",
            "subhead",
            "callout",
            "body",
            "headline",
            "title-3",
            "title-2",
            "title-1",
            "large-title",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
      return;
  }
}
