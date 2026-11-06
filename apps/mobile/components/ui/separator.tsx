import type { RootProps, RootRef } from "@rn-primitives/separator";
import { Root } from "@rn-primitives/separator";
import type * as React from "react";

import { cn } from "~/lib/utils";

/** A one-point `border` line between rows or groups. */
const Separator = ({
  className,
  orientation = "horizontal",
  decorative = true,
  ref,
  ...props
}: RootProps & {
  ref?: React.RefObject<RootRef | null>;
}) => (
  <Root
    className={cn(
      "bg-border shrink-0",
      orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
      className
    )}
    decorative={decorative}
    orientation={orientation}
    ref={ref}
    {...props}
  />
);

Separator.displayName = Root.displayName;

export { Separator };
