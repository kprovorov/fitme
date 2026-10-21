import type { Goal, Place } from "@fitme/core";
import type { SFSymbol } from "sf-symbols-typescript";

/** The SF Symbol for a Plan's goal, on Plan cards and the planner's tiles. */
export function goalSymbol(goal: Goal): SFSymbol {
  if (goal === "muscle-gain") {
    return "figure.strengthtraining.traditional";
  }
  if (goal === "fat-loss") {
    return "flame";
  }
  return "waveform.path.ecg";
}

/** The SF Symbol for where a Plan is trained. */
export function placeSymbol(place: Place): SFSymbol {
  return place === "gym" ? "dumbbell" : "house";
}

/** Workouts per week, and a Workout's Exercise count. */
export const COUNT_SYMBOL: SFSymbol = "bolt.fill";
