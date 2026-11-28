import type { AppLanguage } from "@fitme/core";
import type { ExerciseNote } from "@fitme/services/exercise-notes";
import { planVersion } from "@fitme/services/plan-proposals";
import type { PlanDetail } from "@fitme/services/plans";

import { withExerciseDetails } from "./exercises";

/**
 * A Plan in full as Arnold's Plan reads answer it: every row id the services
 * answer, each Exercise named from the new Library in the App language with
 * the User's Exercise note beside it, and the Plan's version marker
 * (`plan_version`), worked out from the Plan as it was read, which a Plan
 * Proposal that changes it hands back (ADR 0027).
 */
export const shownPlan = async (
  plan: PlanDetail,
  language: AppLanguage,
  notes: readonly ExerciseNote[]
) => {
  const named = await withExerciseDetails(
    plan.workouts.map(({ exercises }) => exercises),
    language,
    notes
  );

  return {
    ...plan,
    plan_version: planVersion(plan),
    workouts: plan.workouts.map((workout, index) => ({
      ...workout,
      exercises: named[index],
    })),
  };
};
