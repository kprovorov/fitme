import * as Slot from "@rn-primitives/slot";
import type * as React from "react";
import { View } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";
import { SymbolImage } from "~/components/symbol-image";
import { TextClassContext } from "~/components/ui/text";
import { cn } from "~/lib/utils";

/**
 * Each variant is a token fill, the foreground that goes on it, and the
 * color of its icon. The icon matches the label, except ghost's: ghost has no
 * fill, a `muted-foreground` label and a `foreground` icon. Destructive is
 * `destructive` text on `secondary`, like the destructive Button
 * (docs/agents/ui.md, Contrast).
 */
const badgeVariants = {
  default: {
    badge: "bg-primary",
    icon: "text-primary-foreground",
    labelClass: "text-primary-foreground",
  },
  destructive: {
    badge: "bg-secondary",
    icon: "text-destructive",
    labelClass: "text-destructive",
  },
  ghost: {
    badge: "",
    icon: "text-foreground",
    labelClass: "text-muted-foreground",
  },
  muted: {
    badge: "bg-muted",
    icon: "text-muted-foreground",
    labelClass: "text-muted-foreground",
  },
  secondary: {
    badge: "bg-secondary",
    icon: "text-secondary-foreground",
    labelClass: "text-secondary-foreground",
  },
} as const;

/** The label's text style; the icon takes its point size and weight. */
const LABEL_FONT_CLASS = "text-footnote-emphasized";

type BadgeIconPosition = "leading" | "trailing";

type BadgeProps = React.ComponentProps<typeof View> & {
  variant?: keyof typeof badgeVariants;
} & (
    | {
        asChild?: false;
        /** SF Symbol drawn next to the label. Decorative: VoiceOver skips it. */
        icon?: SFSymbol;
        iconPosition?: BadgeIconPosition;
      }
    | {
        /** The child takes Badge's look; it has no room for an icon. */
        asChild: true;
        icon?: never;
        iconPosition?: never;
      }
  );

/**
 * A small pill label: a token fill (none for ghost), `rounded-full`, and
 * Footnote Emphasized text in the fill's foreground, handed to the `Text`
 * inside it (the children are the label). `icon` adds an SF Symbol before
 * the label, or after it with `iconPosition="trailing"`, `gap-1` from it, at
 * the label's size and weight, in the variant's icon color. Like `Card`,
 * Badge owns its look: `className` only places it, and Badge's own classes
 * are merged after it, so a caller's fill, radius, padding or gap is dropped.
 */
function Badge({
  className,
  variant = "default",
  asChild,
  children,
  icon,
  iconPosition = "leading",
  ...props
}: BadgeProps) {
  const Component = asChild ? Slot.View : View;
  const iconView = icon ? (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <SymbolImage
        className={cn(LABEL_FONT_CLASS, badgeVariants[variant].icon)}
        name={icon}
      />
    </View>
  ) : null;
  // Without an icon the children pass through as they are, so `asChild`
  // still gets its one element.
  const content = iconView ? (
    <>
      {iconPosition === "leading" ? iconView : null}
      {children}
      {iconPosition === "trailing" ? iconView : null}
    </>
  ) : (
    children
  );
  return (
    <TextClassContext.Provider
      value={cn(LABEL_FONT_CLASS, badgeVariants[variant].labelClass)}
    >
      <Component
        className={cn(
          className,
          "shrink-0 flex-row items-center justify-center gap-1 overflow-hidden rounded-full border-continuous px-2 py-0.5",
          badgeVariants[variant].badge
        )}
        {...props}
      >
        {content}
      </Component>
    </TextClassContext.Provider>
  );
}

export type { BadgeIconPosition, BadgeProps };
export { Badge };
