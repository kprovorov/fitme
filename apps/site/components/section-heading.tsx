import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  align?: "center" | "start";
  className?: string;
  description?: ReactNode;
  eyebrow?: string;
  id?: string;
  title: ReactNode;
}

function SectionHeading({
  align = "center",
  className,
  description,
  eyebrow,
  id,
  title,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "flex max-w-2xl flex-col gap-3",
        align === "center" ? "mx-auto items-center text-center" : "items-start",
        className
      )}
    >
      {eyebrow ? (
        <p className="font-semibold text-footnote text-primary uppercase tracking-wider">
          {eyebrow}
        </p>
      ) : null}
      <h2
        className="text-balance font-bold text-display-2 tracking-tight sm:text-display-1"
        id={id}
      >
        {title}
      </h2>
      {description ? (
        <p className="text-pretty text-body text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export { SectionHeading };
