import type { ViewRef } from "@rn-primitives/types";
import * as React from "react";
import { View, type ViewProps } from "react-native";
import { cn } from "~/lib/utils";

const VStack = React.forwardRef<ViewRef, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      className={cn(
        "flex flex-col items-center justify-center gap-4",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
VStack.displayName = "VStack";

export { VStack };
