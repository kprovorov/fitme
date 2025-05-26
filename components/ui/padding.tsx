import { ViewRef } from "@rn-primitives/types";
import * as React from "react";
import { View, ViewProps } from "react-native";
import { cn } from "~/lib/utils";

const Padding = React.forwardRef<ViewRef, ViewProps>(
  ({ className, ...props }, ref) => (
    <View ref={ref} className={cn("p-6", className)} {...props} />
  ),
);
Padding.displayName = "Padding";

export { Padding };
