import * as Slot from "@rn-primitives/slot";
import type * as React from "react";
import { View } from "react-native";
import { TextClassContext } from "~/components/ui/text";
import { cn } from "~/lib/utils";

/** Each variant is a token fill and the foreground that goes on it. */
const badgeVariants = {
  default: { badge: "bg-primary", text: "text-primary-foreground" },
  destructive: {
    badge: "bg-destructive",
    text: "text-destructive-foreground",
  },
  muted: { badge: "bg-muted", text: "text-muted-foreground" },
  secondary: { badge: "bg-secondary", text: "text-secondary-foreground" },
} as const;

type BadgeProps = React.ComponentProps<typeof View> & {
  asChild?: boolean;
  variant?: keyof typeof badgeVariants;
};

/**
 * A small pill label: a token fill, `rounded-full`, and Footnote Emphasized
 * text in the fill's foreground, handed to the `Text` inside it. Like `Card`,
 * Badge owns its look: `className` only places it, and Badge's own classes
 * are merged after it, so a caller's fill, radius, padding or gap is dropped.
 */
function Badge({
  className,
  variant = "default",
  asChild,
  ...props
}: BadgeProps) {
  const Component = asChild ? Slot.View : View;
  return (
    <TextClassContext.Provider
      value={cn("text-footnote-emphasized", badgeVariants[variant].text)}
    >
      <Component
        className={cn(
          className,
          "shrink-0 flex-row items-center justify-center gap-1 overflow-hidden rounded-full border-continuous px-2 py-0.5",
          badgeVariants[variant].badge
        )}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export type { BadgeProps };
export { Badge };
// throwaway
