import { ViewRef } from "@rn-primitives/types";
import * as React from "react";
import { View, ViewProps } from "react-native";
import { cn } from "~/lib/utils";

const HStack = React.forwardRef<ViewRef, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn(
        "flex flex-row items-center justify-center gap-3",
        className
      )}
      {...props}
    />
  )
);
HStack.displayName = "HStack";

export { HStack };
