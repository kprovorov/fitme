import type { TextRef, ViewRef } from "@rn-primitives/types";
import * as React from "react";
import { Text, type TextProps, View, type ViewProps } from "react-native";
import { TextClassContext } from "~/components/ui/text";
import { cn } from "~/lib/utils";

const cardVariants = {
  default: "border border-border bg-card",
  ghost: "border border-border bg-transparent",
  primary: "bg-primary",
} as const;

const cardPadding = {
  default: "p-sm",
  none: "p-0",
} as const;

type CardVariant = keyof typeof cardVariants;

/**
 * The text colors on each variant's fill, for `CardTitle`,
 * `CardDescription` and `CardContent`: on the lime `primary` fill both turn
 * `primary-foreground`, since lime or white text wouldn't read there.
 */
const cardText = {
  default: {
    content: "text-card-foreground",
    description: "text-muted-foreground",
    title: "text-primary",
  },
  ghost: {
    content: "text-card-foreground",
    description: "text-muted-foreground",
    title: "text-primary",
  },
  primary: {
    content: "text-primary-foreground",
    description: "text-primary-foreground",
    title: "text-primary-foreground",
  },
} as const satisfies Record<
  CardVariant,
  { content: string; description: string; title: string }
>;

const CardVariantContext = React.createContext<CardVariant>("default");

type CardProps = Omit<ViewProps, "style"> & {
  /**
   * Drawn behind the content, filling the card and clipped to its radius
   * (the Workout card's Cover). It isn't padded, whatever `padding` is.
   */
  background?: React.ReactNode;
  padding?: keyof typeof cardPadding;
  ref?: React.RefObject<ViewRef | null>;
  variant?: CardVariant;
};

/**
 * The surface every card in the app sits on, after Figma's Card: the `card`
 * radius and, by default, `sm` padding, with no glass or shadow. `default` is
 * the `card` fill with a 1 px `border` stroke, `ghost` the same stroke with no
 * fill (grouped content that shouldn't read as a surface), `primary` the lime
 * fill with no stroke. `padding="none"` drops the padding, for content that
 * runs to the edges. `background` sits behind the content, clipped to the
 * radius. Card owns its look: `className` only lays it out (flex, gap). Card's
 * own classes are merged after it, so a caller's background, border, radius
 * or padding is dropped, and there's no `style` to get around that.
 */
const Card = ({
  background,
  children,
  className,
  padding = "default",
  ref,
  variant = "default",
  ...props
}: CardProps) => (
  <CardVariantContext.Provider value={variant}>
    <View
      className={cn(
        className,
        "rounded-card border-continuous",
        background ? "overflow-hidden" : undefined,
        cardPadding[padding],
        cardVariants[variant]
      )}
      ref={ref}
      {...props}
    >
      {background ? (
        <View
          aria-hidden
          className="absolute inset-0"
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
        >
          {background}
        </View>
      ) : null}
      {children}
    </View>
  </CardVariantContext.Provider>
);
Card.displayName = "Card";

const CardHeader = ({
  className,
  ref,
  ...props
}: ViewProps & { ref?: React.RefObject<ViewRef | null> }) => (
  <View
    className={cn("flex flex-col gap-sm", className)}
    ref={ref}
    {...props}
  />
);
CardHeader.displayName = "CardHeader";

const CardTitle = ({
  className,
  ref,
  ...props
}: TextProps & { ref?: React.RefObject<TextRef | null> }) => (
  <Text
    aria-level={3}
    className={cn(
      cardText[React.use(CardVariantContext)].title,
      "text-title-2-emphasized",
      className
    )}
    ref={ref}
    role="heading"
    {...props}
  />
);
CardTitle.displayName = "CardTitle";

const CardDescription = ({
  className,
  ref,
  ...props
}: TextProps & { ref?: React.RefObject<TextRef | null> }) => (
  <Text
    className={cn(
      cardText[React.use(CardVariantContext)].description,
      "text-subhead",
      className
    )}
    ref={ref}
    {...props}
  />
);
CardDescription.displayName = "CardDescription";

const CardContent = ({
  className,
  ref,
  ...props
}: ViewProps & { ref?: React.RefObject<ViewRef | null> }) => (
  <TextClassContext.Provider
    value={cardText[React.use(CardVariantContext)].content}
  >
    <View className={className} ref={ref} {...props} />
  </TextClassContext.Provider>
);
CardContent.displayName = "CardContent";

const CardFooter = ({
  className,
  ref,
  ...props
}: ViewProps & { ref?: React.RefObject<ViewRef | null> }) => (
  <View
    className={cn("flex flex-row items-center", className)}
    ref={ref}
    {...props}
  />
);
CardFooter.displayName = "CardFooter";

export type { CardProps };
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
};
