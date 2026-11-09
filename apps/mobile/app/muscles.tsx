import { useTranslation } from "react-i18next";

import { ChoiceSheet } from "~/components/exercises/choice-sheet";
import {
  choosableMuscleGroups,
  getMuscleChoice,
  setMuscleChoice,
} from "~/hooks/muscle-choice";
import { useChoiceLabels } from "~/lib/choices";
// The app's instance, named so it's started wherever the sheet renders.
import { i18n } from "~/lib/i18n";

/** The Muscles sheet: the shared choice sheet over the choosable Muscle groups. */
const MusclesSheet = () => {
  const { t } = useTranslation(undefined, { i18n });
  const labels = useChoiceLabels();

  return (
    <ChoiceSheet
      getChoice={getMuscleChoice}
      label={labels.muscleGroup}
      setChoice={setMuscleChoice}
      title={t("library.muscles")}
      values={choosableMuscleGroups}
    />
  );
};

export default MusclesSheet;
