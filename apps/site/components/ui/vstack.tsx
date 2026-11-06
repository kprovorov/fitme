import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const VStack = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={cn("flex flex-col items-center justify-center gap-3", className)}
    {...props}
  />
);

export { VStack };
