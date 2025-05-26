import { ViewRef } from "@rn-primitives/types";
import * as React from "react";
import { View, ViewProps } from "react-native";
import { cn } from "~/lib/utils";

const VStack = React.forwardRef<ViewRef, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn(
        "flex flex-col items-center justify-center gap-4",
        className,
      )}
      {...props}
    />
  ),
);
VStack.displayName = "VStack";

export { VStack };
