import type { ExerciseSummary } from "@fitme/exercise-library";
import { createFakeExerciseLibrary } from "@fitme/exercise-library/fake";

const media = (slug: string) => ({
  thumbnail_url: `https://media.test/${slug}.jpg`,
  video_url: `https://media.test/${slug}.mp4`,
});

/** The Exercises the tool tests' fake library holds. */
export const libraryExercises: ExerciseSummary[] = [
  {
    muscle_groups: ["chest", "triceps"],
    name: "Bench Press",
    slug: "bench-press",
    ...media("bench-press"),
  },
  {
    muscle_groups: ["chest"],
    name: "Incline Dumbbell Press",
    slug: "incline-dumbbell-press",
    ...media("incline-dumbbell-press"),
  },
  {
    muscle_groups: ["quadriceps", "glutes"],
    name: "Back Squat",
    slug: "back-squat",
    ...media("back-squat"),
  },
];

/**
 * The in-memory Exercise Library the tools get in tests, in place of the
 * API client (`vi.mock("../agent/lib/exercise-library", …)`).
 */
export const fakeLibrary = createFakeExerciseLibrary(libraryExercises);
