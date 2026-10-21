import * as Slot from "@rn-primitives/slot";
import * as React from "react";
import { Platform, Text as RNText, type Role } from "react-native";
import { cn } from "~/lib/utils";

/**
 * The text variants: each is exactly one HIG text style plus its color
 * (docs/agents/ui.md). `Text`'s `variant` and the components in
 * `typography.tsx` (`H1` is `h1`, `Muted` is `muted`, …) both read this map,
 * so the two can't drift. Only `code` and `blockquote` add more than a style
 * and a color: the chip behind inline code and the quote's rule.
 */
const TEXT_VARIANTS = {
  blockquote: "border-border border-l-2 pl-3 text-body text-foreground",
  code: "rounded-sm bg-muted px-1 py-0.5 text-foreground text-mono-subhead-semibold",
  default: "text-body text-foreground",
  h1: "text-large-title-emphasized text-primary",
  h2: "text-primary text-title-1-emphasized",
  h3: "text-foreground text-title-2-emphasized",
  h4: "text-foreground text-title-3-emphasized",
  large: "text-foreground text-headline",
  lead: "text-muted-foreground text-title-2",
  muted: "text-muted-foreground text-subhead",
  p: "text-body text-foreground",
  small: "text-foreground text-subhead-emphasized",
} as const;

type TextVariant = keyof typeof TEXT_VARIANTS;

const ROLE: Partial<Record<TextVariant, Role>> = {
  blockquote: Platform.select({ web: "blockquote" as Role }),
  code: Platform.select({ web: "code" as Role }),
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
};

const ARIA_LEVEL: Partial<Record<TextVariant, string>> = {
  h1: "1",
  h2: "2",
  h3: "3",
  h4: "4",
};

const TextClassContext = React.createContext<string | undefined>(undefined);

type TextProps = React.ComponentProps<typeof RNText> & {
  asChild?: boolean;
  variant?: TextVariant;
};

/**
 * Body text by default. A Primitive that wraps text (`Badge`, `TableHead`,
 * `AvatarFallback`) restyles the `Text` inside it through `TextClassContext`;
 * `className` still wins over both.
 */
function Text({
  className,
  asChild = false,
  variant = "default",
  ...props
}: TextProps) {
  const textClass = React.useContext(TextClassContext);
  const Component = asChild ? Slot.Text : RNText;
  return (
    <Component
      aria-level={ARIA_LEVEL[variant]}
      className={cn(
        "web:select-text",
        TEXT_VARIANTS[variant],
        textClass,
        className
      )}
      role={ROLE[variant]}
      {...props}
    />
  );
}

export type { TextProps, TextVariant };
export { ARIA_LEVEL, ROLE, TEXT_VARIANTS, Text, TextClassContext };
