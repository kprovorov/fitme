import type { ViewRef } from "@rn-primitives/types";
import type * as React from "react";
import { View, type ViewProps } from "react-native";
import { cn } from "~/lib/utils";

const Padding = ({
  className,
  ref,
  ...props
}: ViewProps & { ref?: React.RefObject<ViewRef | null> }) => (
  <View className={cn("p-6", className)} ref={ref} {...props} />
);
Padding.displayName = "Padding";

export { Padding };
