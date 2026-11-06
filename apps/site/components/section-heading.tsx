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

const SectionHeading = ({
  align = "center",
  className,
  description,
  eyebrow,
  id,
  title,
}: SectionHeadingProps) => (
  <div
    className={cn(
      "flex max-w-2xl flex-col gap-3",
      align === "center" ? "mx-auto items-center text-center" : "items-start",
      className
    )}
  >
    {eyebrow ? (
      <p className="text-footnote-emphasized text-primary uppercase">
        {eyebrow}
      </p>
    ) : null}
    <h2
      className="text-display-2 sm:text-display-1 font-bold tracking-tight text-balance"
      id={id}
    >
      {title}
    </h2>
    {description ? (
      <p className="text-body text-muted-foreground text-pretty">
        {description}
      </p>
    ) : null}
  </div>
);

export { SectionHeading };
