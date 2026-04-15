import type { ViewRef } from "@rn-primitives/types";
import * as React from "react";
import { View, type ViewProps } from "react-native";
import { cn } from "~/lib/utils";

const Padding = React.forwardRef<ViewRef, ViewProps>(
  ({ className, ...props }, ref) => (
    <View className={cn("p-6", className)} ref={ref} {...props} />
  )
);
Padding.displayName = "Padding";

export { Padding };
