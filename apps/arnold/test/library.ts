import { createFakeLibrary, type FakeExercise } from "@fitme/library-sdk/fake";

const media = (slug: string) => ({
  thumbnail_url: `https://media.test/${slug}.jpg`,
  video_url: `https://media.test/${slug}.mp4`,
});

/**
 * The Exercises the tool tests' fake library holds, in English; Bench Press
 * and Back Squat are translated into Ukrainian, Incline Dumbbell Press isn't.
 */
export const libraryExercises: FakeExercise[] = [
  {
    muscle_groups: ["chest", "triceps"],
    name: "Bench Press",
    slug: "bench-press",
    translations: { uk: { name: "Жим лежачи" } },
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
    translations: { uk: { name: "Присідання зі штангою" } },
    ...media("back-squat"),
  },
];

/**
 * The in-memory Library the tools get in tests, in place of the
 * API client (`vi.mock("../agent/lib/library", …)`).
 */
export const fakeLibrary = createFakeLibrary(libraryExercises);
