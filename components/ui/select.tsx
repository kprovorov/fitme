import { Picker, type PickerProps, type PickerValue } from "./picker";

type SelectProps<TValue extends PickerValue> = Omit<
  PickerProps<TValue>,
  "variant"
>;

/**
 * A dropdown selection. SwiftUI's menu `Picker` renders the label and current
 * value inline and presents the options as a native menu, so there is no
 * separate trigger/content pair to compose.
 */
const Select = <TValue extends PickerValue>(props: SelectProps<TValue>) => (
  <Picker {...props} variant="menu" />
);

Select.displayName = "Select";

export type { SelectProps };
export { Select };
