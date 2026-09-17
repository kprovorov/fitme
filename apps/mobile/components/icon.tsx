import type { LucideIcon } from "lucide-react-native";
import { StyleSheet } from "react-native";
import { withUniwind } from "uniwind";

function IconBase({
  icon: Icon,
  style,
  strokeWidth,
}: {
  icon: LucideIcon;
  // biome-ignore lint/suspicious/noExplicitAny: withUniwind injects className-resolved style which is opaque
  style?: any;
  strokeWidth?: number;
  className?: string;
}) {
  const flat = StyleSheet.flatten(style) || {};
  const size = (flat.width as number) ?? (flat.height as number) ?? 24;
  const color = (flat.color as string) ?? "currentColor";
  return <Icon color={color} size={size} strokeWidth={strokeWidth} />;
}

export const Icon = withUniwind(IconBase);
