const WORD_SEPARATORS = /-+/;

/**
 * A readable name made from an Exercise slug (`barbell-back-squat` →
 * `Barbell back squat`), for an Exercise the library can't resolve: unknown
 * to it, or the library unavailable. Never blank: a slug with no words is
 * its own name. `private.exercise_name_from_slug` in Postgres (the names
 * `workout_session_plan_changes` answers) follows the same rule: change both
 * together.
 */
export const exerciseNameFromSlug = (slug: string): string => {
  const words = slug.split(WORD_SEPARATORS).filter(Boolean).join(" ");
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : slug;
};
