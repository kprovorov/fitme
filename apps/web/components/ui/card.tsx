import type { ComponentProps } from "react";

import { cn } from "~/lib/utils";

// The Card owns the padding and the gap between its parts, so every card gets
// the same inset whether or not it has a header.
export const Card = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={cn(
      "gap-sm rounded-card bg-card p-sm text-card-foreground flex flex-col",
      className
    )}
    {...props}
  />
);

export const CardHeader = ({ className, ...props }: ComponentProps<"div">) => (
  <div className={cn("flex flex-col gap-1.5", className)} {...props} />
);

export const CardTitle = ({
  className,
  children,
  ...props
}: ComponentProps<"h3">) => (
  <h3
    className={cn(
      "text-primary text-lg leading-none font-bold tracking-tight",
      className
    )}
    {...props}
  >
    {children}
  </h3>
);

export const CardDescription = ({
  className,
  ...props
}: ComponentProps<"p">) => (
  <p className={cn("text-muted-foreground text-sm", className)} {...props} />
);

export const CardContent = ({ className, ...props }: ComponentProps<"div">) => (
  <div className={className} {...props} />
);
