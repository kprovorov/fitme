import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const Container = ({ className, ...props }: ComponentProps<"div">) => (
  <div className={cn("container", className)} {...props} />
);

export { Container };
