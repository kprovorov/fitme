import type { TextRef, ViewRef } from "@rn-primitives/types";
import type * as React from "react";
import { Text, type TextProps, View, type ViewProps } from "react-native";
import { TextClassContext } from "~/components/ui/text";
import { cn } from "~/lib/utils";

const Card = ({
  className,
  ref,
  ...props
}: ViewProps & { ref?: React.RefObject<ViewRef | null> }) => (
  <View
    className={cn("rounded-2xl bg-card/70", className)}
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
    className={cn("flex flex-col gap-sm px-sm", className)}
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
    <View className={cn("px-sm", className)} ref={ref} {...props} />
  </TextClassContext.Provider>
);
CardContent.displayName = "CardContent";

const CardFooter = ({
  className,
  ref,
  ...props
}: ViewProps & { ref?: React.RefObject<ViewRef | null> }) => (
  <View
    className={cn("flex flex-row items-center px-4", className)}
    ref={ref}
    {...props}
  />
);
CardFooter.displayName = "CardFooter";

export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
};
