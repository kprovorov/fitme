import type * as LabelPrimitive from "@rn-primitives/label";
import { Root as LabelRoot, Text as LabelText } from "@rn-primitives/label";
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
  <LabelRoot
    disabled={disabled}
    onLongPress={onLongPress}
    onPress={onPress}
    onPressIn={onPressIn}
    onPressOut={onPressOut}
  >
    <LabelText
      className={cn(
        "text-body-emphasized text-foreground",
        disabled && "opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  </LabelRoot>
);

Label.displayName = LabelRoot.displayName;

export type { LabelProps };

export { Label };
