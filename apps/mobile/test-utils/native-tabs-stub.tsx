/**
 * Stand-in for `expo-router/native-tabs`, whose native tab bar can't mount
 * under Jest: each tab a View (`testID` `tab:<route name>`), its label as
 * text, its icon an empty View whose `testID` names the SF Symbol
 * (`sf:<symbol>`, or `sf:<default>|<selected>` for a pair). Use it with
 * `jest.mock("expo-router/native-tabs", () => jest.requireActual("~/test-utils/native-tabs-stub"))`.
 */
import type { ReactNode } from "react";
import { Text, View } from "react-native";

interface ChildrenProps {
  children?: ReactNode;
}

interface IconProps {
  sf?: string | { default?: string; selected?: string };
}

interface TriggerProps extends ChildrenProps {
  name: string;
}

const Label = ({ children }: ChildrenProps) => <Text>{children}</Text>;

const symbolName = (sf: IconProps["sf"]) =>
  typeof sf === "object" ? `${sf.default}|${sf.selected}` : sf;

const Icon = ({ sf }: IconProps) => <View testID={`sf:${symbolName(sf)}`} />;

const Trigger = Object.assign(
  ({ children, name }: TriggerProps) => (
    <View testID={`tab:${name}`}>{children}</View>
  ),
  { Icon, Label }
);

export const NativeTabs = Object.assign(
  ({ children }: ChildrenProps) => <View>{children}</View>,
  { Trigger }
);
