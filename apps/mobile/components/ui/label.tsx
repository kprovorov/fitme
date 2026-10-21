import * as LabelPrimitive from "@rn-primitives/label";
import type * as React from "react";
import { cn } from "~/lib/utils";

const Label = ({
  className,
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  ref,
  ...props
}: LabelPrimitive.TextProps & {
  ref?: React.RefObject<LabelPrimitive.TextRef | null>;
}) => (
  <LabelPrimitive.Root
    className="web:cursor-default"
    onLongPress={onLongPress}
    onPress={onPress}
    onPressIn={onPressIn}
    onPressOut={onPressOut}
  >
    <LabelPrimitive.Text
      className={cn(
        "text-body-emphasized text-foreground web:peer-disabled:cursor-not-allowed web:peer-disabled:opacity-70",
        className
      )}
      ref={ref}
      {...props}
    />
  </LabelPrimitive.Root>
);
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
