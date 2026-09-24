import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

function HStack({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-row items-center justify-center gap-3",
        className
      )}
      {...props}
    />
  );
}

export { HStack };
