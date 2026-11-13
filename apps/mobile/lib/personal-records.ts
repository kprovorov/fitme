import { formatCount, spokenUnit } from "@fitme/i18n";
import type { Translator } from "@fitme/i18n";

import type {
  WorkoutSessionHistory,
  WorkoutSessionHistoryEntry,
} from "~/hooks/queries/workout-sessions";

type PersonalRecord = WorkoutSessionHistoryEntry["personal_records"][number];

/**
 * How VoiceOver reads a set of Personal records after the rest of a row
 * ("Personal record: Bench Press, 100 kilograms × 5 reps"): History's row and
 * the Workout Summary's Exercise rows say it the same way.
 */
export const spokenPersonalRecords = ({
  exerciseName,
  i18n,
  records,
  weightUnit,
}: {
  /** The Exercise's shown name, by its slug. */
  exerciseName: (slug: string) => string;
  i18n: Translator;
  records: readonly PersonalRecord[];
  weightUnit: WorkoutSessionHistory["weightUnit"];
}): string =>
  i18n.t("history.personalRecords", {
    count: records.length,
    records: records
      .map((record) => {
        const result = {
          exercise: exerciseName(record.exercise_slug),
          reps: formatCount(i18n, "reps", record.reps),
        };

        return record.weight === 0
          ? i18n.t("history.bodyweightRecordResult", result)
          : i18n.t("history.recordResult", {
              ...result,
              weight: spokenUnit(i18n, record.weight, weightUnit),
            });
      })
      .join("; "),
  });
