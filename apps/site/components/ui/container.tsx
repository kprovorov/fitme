import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("container", className)} {...props} />;
}

export { Container };
