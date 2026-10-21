import * as LabelPrimitive from "@rn-primitives/label";
import type * as React from "react";
import { cn } from "~/lib/utils";

type LabelProps = LabelPrimitive.TextProps & {
  /** Dims the label with the field it names. */
  disabled?: boolean;
  ref?: React.RefObject<LabelPrimitive.TextRef | null>;
};

/** A field's name: Body Emphasized in `foreground`, dimmed when `disabled`. */
const Label = ({
  className,
  disabled = false,
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  ref,
  ...props
}: LabelProps) => (
  <LabelPrimitive.Root
    disabled={disabled}
    onLongPress={onLongPress}
    onPress={onPress}
    onPressIn={onPressIn}
    onPressOut={onPressOut}
  >
    <LabelPrimitive.Text
      className={cn(
        "text-body-emphasized text-foreground",
        disabled && "opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  </LabelPrimitive.Root>
);
Label.displayName = LabelPrimitive.Root.displayName;

export type { LabelProps };
export { Label };
