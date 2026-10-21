import type { TextRef, ViewRef } from "@rn-primitives/types";
import type * as React from "react";
import { Text, type TextProps, View, type ViewProps } from "react-native";
import { TextClassContext } from "~/components/ui/text";
import { cn } from "~/lib/utils";

const cardVariants = {
  default: "bg-card",
  ghost: "bg-transparent",
} as const;

type CardProps = ViewProps & {
  ref?: React.RefObject<ViewRef | null>;
  variant?: keyof typeof cardVariants;
};

/**
 * The surface every card in the app sits on: a flat `card` fill with the
 * `card` radius and `sm` padding, no glass, border or shadow. `ghost` keeps
 * the radius and padding with no fill, for grouped content that shouldn't
 * read as a surface. Card owns its look: `className` only lays it out (flex,
 * gap), never sets a background, radius or padding.
 */
const Card = ({ className, ref, variant = "default", ...props }: CardProps) => (
  <View
    className={cn(
      "rounded-card border-continuous p-sm",
      cardVariants[variant],
      className
    )}
    ref={ref}
    {...props}
  />
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
      "font-nunito-sans-bold text-primary text-title-2 tracking-tight",
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
    className={cn("text-muted-foreground text-subhead", className)}
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
  <TextClassContext.Provider value="text-card-foreground">
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
