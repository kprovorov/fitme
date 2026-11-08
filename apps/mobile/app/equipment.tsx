import { equipment } from "@fitme/core";
import { useTranslation } from "react-i18next";

import { ChoiceSheet } from "~/components/exercises/choice-sheet";
import {
  getEquipmentChoice,
  setEquipmentChoice,
} from "~/hooks/equipment-choice";
import { useChoiceLabels } from "~/lib/choices";
// The app's instance, named so it's started wherever the sheet renders.
import { i18n } from "~/lib/i18n";

/** The Equipment sheet: the shared choice sheet over core's Equipment. */
const EquipmentSheet = () => {
  const { t } = useTranslation(undefined, { i18n });
  const labels = useChoiceLabels();

  return (
    <ChoiceSheet
      getChoice={getEquipmentChoice}
      label={labels.equipment}
      setChoice={setEquipmentChoice}
      title={t("library.equipment")}
      values={equipment}
    />
  );
};

export default EquipmentSheet;
