import type { ComponentProps } from "react";
import { cn } from "~/lib/utils";

// The Card owns the padding and the gap between its parts, so every card gets
// the same inset whether or not it has a header.
export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col gap-sm rounded-card bg-card p-sm text-card-foreground",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return (
    <h3
      className={cn(
        "font-bold text-lg text-primary leading-none tracking-tight",
        className
      )}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p className={cn("text-muted-foreground text-sm", className)} {...props} />
  );
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={className} {...props} />;
}
