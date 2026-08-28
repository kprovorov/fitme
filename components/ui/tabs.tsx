import { Picker, type PickerProps, type PickerValue } from "./picker";

type TabsProps<TValue extends PickerValue> = Omit<
  PickerProps<TValue>,
  "variant"
>;

/**
 * A segmented control. SwiftUI's segmented `Picker` owns both the tab strip and
 * the selection, so unlike the previous primitive there is no separate
 * `TabsList`/`TabsTrigger`/`TabsContent` — render the panel yourself off `value`.
 */
const Tabs = <TValue extends PickerValue>(props: TabsProps<TValue>) => (
  <Picker {...props} variant="segmented" />
);

Tabs.displayName = "Tabs";

export type { TabsProps };
export { Tabs };
