/**
 * Stand-in for `expo-router/native-tabs`, whose native tab bar can't mount
 * under Jest: each tab a View, its label as text, no icon. Use it with
 * `jest.mock("expo-router/native-tabs", () => jest.requireActual("~/test-utils/native-tabs-stub"))`.
 */
import type { ReactNode } from "react";
import { Text, View } from "react-native";

interface ChildrenProps {
  children?: ReactNode;
}

const Label = ({ children }: ChildrenProps) => <Text>{children}</Text>;

const Icon = () => null;

const Trigger = Object.assign(
  ({ children }: ChildrenProps) => <View>{children}</View>,
  { Icon, Label }
);

export const NativeTabs = Object.assign(
  ({ children }: ChildrenProps) => <View>{children}</View>,
  { Trigger }
);
