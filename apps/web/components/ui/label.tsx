import type { ComponentProps } from "react";
import { cn } from "~/lib/utils";

export function Label({
  children,
  className,
  htmlFor,
  ...props
}: ComponentProps<"label">) {
  return (
    <label
      className={cn("font-semibold text-sm leading-none", className)}
      htmlFor={htmlFor}
      {...props}
    >
      {children}
    </label>
  );
}
