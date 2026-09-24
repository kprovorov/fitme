import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

function MainBox({ className, ...props }: ComponentProps<"main">) {
  return (
    <main
      className={cn(
        "flex min-h-screen flex-col items-center justify-start gap-12 py-20",
        className
      )}
      {...props}
    />
  );
}

export { MainBox };
