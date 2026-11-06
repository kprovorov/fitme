import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const HStack = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={cn("flex flex-row items-center justify-center gap-3", className)}
    {...props}
  />
);

export { HStack };
