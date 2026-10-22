import { createExerciseLibrary } from "@fitme/exercise-library";
import { getClerk } from "~/lib/clerk";

/**
 * The Exercise Library API (`apps/exercises`), called as the signed-in User
 * with their Clerk session token, resolved per request so Clerk's refreshes
 * apply. Unset `EXPO_PUBLIC_EXERCISES_URL` fails every call unavailable, so
 * Exercises show the names made from their slugs.
 */
export const exerciseLibrary = createExerciseLibrary({
  token: async () => (await getClerk().session?.getToken()) ?? null,
  url: process.env.EXPO_PUBLIC_EXERCISES_URL ?? "",
});
