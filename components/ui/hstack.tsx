import type { ViewRef } from "@rn-primitives/types";
import * as React from "react";
import { View, type ViewProps } from "react-native";
import { cn } from "~/lib/utils";

const HStack = React.forwardRef<ViewRef, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      className={cn(
        "flex flex-row items-center justify-center gap-4",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
HStack.displayName = "HStack";

export { HStack };
