import type { components } from "@fitme/api-client";
import { formatCount, formatNumber, spokenUnit, unitName } from "@fitme/i18n";
import type { Translator } from "@fitme/i18n";

/**
 * The Public API's Plan Update (`GET /v1/workout-sessions/{id}/plan-update`):
 * the Plan and Workout a finished Workout Session would update (null when
 * they're gone), its changes and the Plan sets the User removed (each in
 * Workout order, Exercises as slugs), and the unit of their weights.
 */
export type PlanUpdate = components["schemas"]["PlanUpdate"];

export type PlanUpdateChange = components["schemas"]["PlanUpdateChange"];

export type PlanUpdateChangeKind = PlanUpdateChange["kind"];

/** The Plan sets of one Exercise that would go, by their targets. */
export type PlanUpdateSetRemoval =
  components["schemas"]["PlanUpdateSetRemoval"];

type PlanUpdateSet = components["schemas"]["PlanUpdateSet"];

type WeightUnit = PlanUpdate["weight_unit"];

export interface PlanChangeLine {
  /** The line spelled out for VoiceOver, without `×` and `·`. */
  accessibilityLabel: string;
  text: string;
}

// The unit stays on the last set's line: a no-break space before it, so a
// line that wraps never leaves the unit alone on the next one.
const setsText = (
  translator: Translator,
  sets: PlanUpdateSet[],
  unit: WeightUnit
) =>
  `${sets
    .map(
      ({ reps, weight }) =>
        `${formatNumber(translator, reps)}×${formatNumber(translator, weight)}`
    )
    .join(", ")}\u00A0${unitName(translator, unit)}`;

const spokenSets = (
  translator: Translator,
  sets: PlanUpdateSet[],
  unit: WeightUnit
) =>
  sets
    .map(({ reps, weight }) =>
      translator.t("planUpdate.changes.spokenSet", {
        reps: formatCount(translator, "reps", reps),
        weight: spokenUnit(translator, weight, unit),
      })
    )
    .join(", ");

/**
 * The Plan Update's set removals: none in an answer without the field, which
 * an API deployed before it (or rolled back) doesn't send.
 */
export const setRemovalsOf = (
  planUpdate: Pick<Partial<PlanUpdate>, "set_removals">
): PlanUpdateSetRemoval[] => planUpdate.set_removals ?? [];

/** Whether the Plan Update has something to ask the User about. */
export const hasPlanUpdate = (planUpdate: PlanUpdate): boolean =>
  planUpdate.changes.length > 0 || setRemovalsOf(planUpdate).length > 0;

/** Every Exercise slug the Plan Update names, for the Library. */
export const planUpdateSlugs = (planUpdate: PlanUpdate): string[] => [
  ...planUpdate.changes.flatMap((change) =>
    change.kind === "replace_exercise"
      ? [change.replaced_exercise_slug, change.exercise_slug]
      : [change.exercise_slug]
  ),
  ...setRemovalsOf(planUpdate).map(({ exercise_slug }) => exercise_slug),
];

/** A line naming the sets after its title: "Add Cable Fly · 12×15 kg". */
const lineWithSets = (
  title: string,
  sets: PlanUpdateSet[],
  weightUnit: WeightUnit,
  translator: Translator
): PlanChangeLine => ({
  accessibilityLabel: translator.t("planUpdate.changes.spokenLine", {
    change: title,
    sets: spokenSets(translator, sets, weightUnit),
  }),
  text: translator.t("planUpdate.changes.line", {
    change: title,
    sets: setsText(translator, sets, weightUnit),
  }),
});

/**
 * The sheet's line for one change, weights in `weightUnit` and each Exercise
 * by `nameOf` its slug, its text, numbers, units and counts from
 * `translator`'s catalog: "Replace Bench Press with Dumbbell Press · 8×30,
 * 6×30 kg", "Add Cable Fly · 12×15 kg", "Remove Dips", "Add 1 set to Squat ·
 * 5×100 kg" ("Додати 2 підходи до «Squat» · 5×62,5, 5×62,5 кг").
 */
export const formatPlanChange = (
  change: PlanUpdateChange,
  weightUnit: WeightUnit,
  nameOf: (slug: string) => string,
  translator: Translator
): PlanChangeLine => {
  const exercise = nameOf(change.exercise_slug);
  let title: string;

  switch (change.kind) {
    case "replace_exercise": {
      title = translator.t("planUpdate.changes.replace", {
        exercise,
        replaced: nameOf(change.replaced_exercise_slug),
      });
      break;
    }

    case "add_exercise": {
      title = translator.t("planUpdate.changes.add", { exercise });
      break;
    }

    case "remove_exercise": {
      const text = translator.t("planUpdate.changes.remove", { exercise });

      return { accessibilityLabel: text, text };
    }

    case "add_sets": {
      title = translator.t("planUpdate.changes.addSets", {
        count: change.sets.length,
        exercise,
      });
      break;
    }

    default: {
      const unknown: never = change;
      throw new Error(`Unknown plan change ${JSON.stringify(unknown)}`);
    }
  }

  return lineWithSets(title, change.sets, weightUnit, translator);
};

/**
 * The sheet's line for one Exercise's set removal, naming the Plan sets that
 * go by their targets: "Remove 1 set from Squat · 10×40 kg".
 */
export const formatSetRemoval = (
  { exercise_slug, sets }: PlanUpdateSetRemoval,
  weightUnit: WeightUnit,
  nameOf: (slug: string) => string,
  translator: Translator
): PlanChangeLine =>
  lineWithSets(
    translator.t("planUpdate.changes.removeSets", {
      count: sets.length,
      exercise: nameOf(exercise_slug),
    }),
    sets,
    weightUnit,
    translator
  );

/**
 * How many changes of each kind, and how many Exercises lose sets
 * (`remove_sets`, as `add_sets` counts those gaining some), for analytics.
 */
export const countPlanChanges = (
  planUpdate: PlanUpdate
): Record<PlanUpdateChangeKind | "remove_sets", number> => {
  const counts = {
    add_exercise: 0,
    add_sets: 0,
    remove_exercise: 0,
    remove_sets: setRemovalsOf(planUpdate).length,
    replace_exercise: 0,
  };

  for (const change of planUpdate.changes) {
    counts[change.kind] += 1;
  }

  return counts;
};

/** What every Plan Update analytics event says about the question. */
export const planUpdateProperties = (
  sessionId: string,
  { plan, workout }: PlanUpdate
) => ({
  plan_id: plan?.id,
  workout_id: workout?.id,
  workout_session_id: sessionId,
});
