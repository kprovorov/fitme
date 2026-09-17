import type { TextRef, ViewRef } from "@rn-primitives/types";
import { GlassView } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import type * as React from "react";
import {
  StyleSheet,
  Text,
  type TextProps,
  View,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { useResolveClassNames } from "uniwind";
import { AppleGlassView } from "~/components/tw";
import { GLASS_ENABLED } from "~/components/ui/swift-ui";
import { TextClassContext } from "~/components/ui/text";
import { cn } from "~/lib/utils";

const GLASS_HIGHLIGHT = [
  "rgba(255, 255, 255, 0.16)",
  "rgba(255, 255, 255, 0)",
] as const;

const highlightStyle = StyleSheet.flatten([
  StyleSheet.absoluteFill,
  { height: "45%" as const },
]);

type CardProps = ViewProps & { ref?: React.RefObject<ViewRef | null> };

/**
 * Glass surface for every card in the app.
 *
 * On iOS 26+ this is expo-glass-effect's native `GlassView` (UIGlassEffect)
 * in the `clear` style, which lenses and refracts whatever scrolls behind it.
 * The system draws its own rim and highlights, so nothing is layered on top,
 * and consumers must not set a `bg-*` class: a background colour on the native
 * view disables the effect. Use `tintColor` for a tint instead. Elsewhere it
 * falls back to a blurred material dressed with a frosted wash and a top-edge
 * highlight so the surface still reads as glass.
 */
const LiquidGlassCard = ({ className, ref, style, ...props }: CardProps) => {
  // GlassView is a raw native view without className support, so the
  // Tailwind classes are resolved to a style object here.
  const resolved = useResolveClassNames(
    cn("overflow-hidden rounded-2xl", className)
  );

  return (
    <GlassView
      glassEffectStyle="clear"
      ref={ref}
      style={[resolved as ViewStyle, { borderCurve: "continuous" }, style]}
      {...props}
    />
  );
};

const Card = GLASS_ENABLED
  ? LiquidGlassCard
  : ({ className, children, ref, style, ...props }: CardProps) => (
      <AppleGlassView
        className={cn(
          "overflow-hidden rounded-2xl border-hairline border-white/70 dark:border-white/15",
          className
        )}
        fallbackIntensity={60}
        fallbackTint="systemChromeMaterial"
        ref={ref}
        style={[{ borderCurve: "continuous" }, style]}
        {...props}
      >
        <View
          className="absolute inset-0 bg-white/60 dark:bg-white/[0.07]"
          pointerEvents="none"
        />
        <LinearGradient
          colors={GLASS_HIGHLIGHT}
          end={{ x: 0.5, y: 1 }}
          pointerEvents="none"
          start={{ x: 0.5, y: 0 }}
          style={highlightStyle}
        />
        {children}
      </AppleGlassView>
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
