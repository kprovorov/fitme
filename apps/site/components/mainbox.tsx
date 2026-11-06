import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const MainBox = ({ className, ...props }: ComponentProps<"main">) => (
  <main
    className={cn(
      "flex min-h-screen flex-col items-center justify-start gap-12 py-20",
      className
    )}
    {...props}
  />
);

export { MainBox };
