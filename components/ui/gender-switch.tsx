import { Picker } from "~/components/ui/picker";
import { getGenderLabel } from "~/lib/labels";
import { type Gender, genders } from "~/lib/models";

interface GenderSwitchProps {
  className?: string;
  onValueChange?: (value: Gender) => void;
  testID?: string;
  value?: Gender;
}

const GENDER_OPTIONS = genders.map((gender) => ({
  value: gender,
  label: getGenderLabel(gender),
}));

const GenderSwitch = ({
  value,
  onValueChange,
  className,
  testID,
}: GenderSwitchProps) => (
  <Picker
    className={className}
    onValueChange={onValueChange}
    options={GENDER_OPTIONS}
    testID={testID}
    value={value}
    variant="segmented"
  />
);

GenderSwitch.displayName = "GenderSwitch";

export type { GenderSwitchProps };
export { GenderSwitch };
