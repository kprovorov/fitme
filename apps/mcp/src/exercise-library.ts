import {
  createExerciseLibrary,
  type ExerciseLibrary,
} from "@fitme/exercise-library";

/**
 * Builds the Exercise Library client the tools search, check and name
 * Exercises through, or returns `null` when the server isn't configured for it.
 */
export type ExerciseLibraryFactory = () => ExerciseLibrary | null;

/**
 * The Exercise Library API at `EXERCISES_URL`, called with the MCP server's
 * own secret (`EXERCISES_MCP_SECRET`), never a User's token.
 */
export const createExerciseLibraryFromEnv: ExerciseLibraryFactory = () => {
  const url = process.env.EXERCISES_URL;
  const secret = process.env.EXERCISES_MCP_SECRET;
  if (!(url && secret)) {
    return null;
  }
  return createExerciseLibrary({ token: () => Promise.resolve(secret), url });
};
