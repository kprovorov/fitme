import * as Slot from "@rn-primitives/slot";
import { SymbolView } from "expo-symbols";
import type * as React from "react";
import { View } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";
import { useCSSVariable, useResolveClassNames } from "uniwind";
import { TextClassContext } from "~/components/ui/text";
import { cn } from "~/lib/utils";

/**
 * Each variant is a token fill, the foreground that goes on it, and the
 * color of its icon (a `--color-*` token, read at runtime, since the native
 * symbol takes a color value). The icon matches the label, except ghost's:
 * ghost has no fill, a `muted-foreground` label and a `foreground` icon.
 * Destructive is `destructive` text on `secondary`, like the destructive
 * Button (docs/agents/ui.md, Contrast).
 */
const badgeVariants = {
  default: {
    badge: "bg-primary",
    icon: "--color-primary-foreground",
    text: "text-primary-foreground",
  },
  destructive: {
    badge: "bg-secondary",
    icon: "--color-destructive",
    text: "text-destructive",
  },
  ghost: {
    badge: "",
    icon: "--color-foreground",
    text: "text-muted-foreground",
  },
  muted: {
    badge: "bg-muted",
    icon: "--color-muted-foreground",
    text: "text-muted-foreground",
  },
  secondary: {
    badge: "bg-secondary",
    icon: "--color-secondary-foreground",
    text: "text-secondary-foreground",
  },
} as const;

/** The label's text style; the icon is drawn at its point size. */
const LABEL_FONT_CLASS = "text-footnote-emphasized";

type BadgeIconPosition = "leading" | "trailing";

type BadgeProps = React.ComponentProps<typeof View> & {
  asChild?: boolean;
  /** SF Symbol drawn next to the label. Decorative: VoiceOver skips it. */
  icon?: SFSymbol;
  iconPosition?: BadgeIconPosition;
  variant?: keyof typeof badgeVariants;
};

/**
 * The icon: the variant's icon color, the label's point size (Footnote) and
 * Semibold, Footnote Emphasized's weight, as Button draws its icon at its
 * label's size.
 */
function BadgeIcon({
  name,
  variant,
}: {
  name: SFSymbol;
  variant: keyof typeof badgeVariants;
}) {
  const color = useCSSVariable(badgeVariants[variant].icon) as string;
  const { fontSize } = useResolveClassNames(LABEL_FONT_CLASS);
  return (
    <SymbolView
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      name={name}
      size={fontSize}
      tintColor={color}
      weight="semibold"
    />
  );
}

/**
 * A small pill label: a token fill (none for ghost), `rounded-full`, and
 * Footnote Emphasized text in the fill's foreground, handed to the `Text`
 * inside it (the children are the label). `icon` adds an SF Symbol before
 * the label, or after it with `iconPosition="trailing"`, `gap-1` from it.
 * Like `Card`, Badge owns its look: `className` only places it, and Badge's
 * own classes are merged after it, so a caller's fill, radius, padding or gap
 * is dropped.
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
  const iconView = icon ? <BadgeIcon name={icon} variant={variant} /> : null;
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
      value={cn(LABEL_FONT_CLASS, badgeVariants[variant].text)}
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
