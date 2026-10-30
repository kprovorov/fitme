import type { TFunction } from "i18next";
import { ApiError, rateLimitedFor } from "~/lib/api/client";

/** What to tell the User after a failed edit of the Workout Session's Exercises. */
export const sessionEditFailureMessage = (t: TFunction, error: unknown) => {
  if (error instanceof ApiError) {
    if (error.code === "library_unavailable") {
      return t("workoutSession.editFailed.libraryUnavailable");
    }
    if (error.code === "session_finished") {
      return t("workoutSession.editFailed.sessionFinished");
    }
  }
  const waitSeconds = rateLimitedFor(error);
  return waitSeconds === null
    ? t("workoutSession.editFailed.generic")
    : t("workoutSession.editFailed.rateLimited", { seconds: waitSeconds });
};
