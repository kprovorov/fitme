import type { ViewRef } from "@rn-primitives/types";
import type * as React from "react";
import { View, type ViewProps } from "react-native";
import { cn } from "~/lib/utils";

const HStack = ({
  className,
  ref,
  ...props
}: ViewProps & { ref?: React.RefObject<ViewRef | null> }) => (
  <View
    className={cn("flex flex-row items-center justify-center gap-4", className)}
    ref={ref}
    {...props}
  />
);
HStack.displayName = "HStack";

export { HStack };
