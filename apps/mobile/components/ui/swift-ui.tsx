import { Host } from "@expo/ui/swift-ui";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Children, isValidElement, type ReactNode } from "react";
import { Platform } from "react-native";
import { useResolveClassNames, withUniwind } from "uniwind";

/**
 * SwiftUI's glass button styles and `glassEffect` modifier are no-ops below
 * iOS 26 — `buttonStyle('glass')` quietly degrades to `.automatic`, which
 * draws no background at all. This app still ships to iOS 15.1, so every
 * glass treatment needs a solid fallback behind this flag.
 */
export const GLASS_ENABLED = isLiquidGlassAvailable();

/**
 * `buttonBorderShape("circle")` needs iOS 17: below it `@expo/ui` quietly
 * falls back to `.automatic` (`ios/Modifiers/ButtonBorderShapeModifier.swift`),
 * which draws a rounded rectangle. The app supports iOS 16.4, so circle
 * buttons paint their own circle where this is false.
 */
export const NATIVE_CIRCLE_ENABLED =
  Platform.OS !== "ios" || Number.parseInt(String(Platform.Version), 10) >= 17;

/**
 * SwiftUI's `.infinity` can't cross the bridge, but `.frame(maxWidth:)` is
 * clamped to the size the parent proposes, so a large finite value behaves
 * identically inside a bounded host.
 */
export const FILL = 10_000;

/** `Host` with Uniwind's `className` -> `style` mapping applied. */
export const SwiftUIHost = withUniwind(Host);

/** Class names that make a control span the width its parent hands it. */
const STRETCH_CLASS = /\b(w-full|flex-1|self-stretch|grow)\b/;

export function isStretchClassName(className?: string): boolean {
  return !!className && STRETCH_CLASS.test(className);
}

/**
 * SwiftUI colors come from the same Tailwind tokens the rest of the app uses,
 * resolved through Uniwind so theme switches keep working.
 */
export function useSwiftUITheme() {
  const primary = useResolveClassNames("text-primary");
  const primaryForeground = useResolveClassNames("text-primary-foreground");
  const secondary = useResolveClassNames("text-secondary");
  const secondaryForeground = useResolveClassNames("text-secondary-foreground");
  const destructive = useResolveClassNames("text-destructive");
  const destructiveForeground = useResolveClassNames(
    "text-destructive-foreground"
  );
  const foreground = useResolveClassNames("text-foreground");

  return {
    destructive: destructive.color as string,
    destructiveForeground: destructiveForeground.color as string,
    foreground: foreground.color as string,
    primary: primary.color as string,
    primaryForeground: primaryForeground.color as string,
    secondary: secondary.color as string,
    secondaryForeground: secondaryForeground.color as string,
  };
}

/**
 * Resolves a text style utility (`text-body-emphasized`) into the family and
 * size SwiftUI's `font` modifier wants, so native controls use the same type
 * scale as the rest of the app (`@fitme/design-tokens`).
 */
export function useSwiftUIFont(className: string) {
  const style = useResolveClassNames(className);

  return {
    family: style.fontFamily as string | undefined,
    size: style.fontSize as number | undefined,
  };
}

/**
 * Collapses a React subtree into a plain string, so callers can keep passing
 * `<Text>Save</Text>` to controls that need SwiftUI's string `label`.
 * Returns `null` when the subtree holds anything a string can't represent
 * (an icon, an image), which is the signal to host the children natively.
 */
export function childrenToLabel(children: ReactNode): string | null {
  const parts: string[] = [];

  const walk = (node: ReactNode): boolean => {
    if (node === null || node === undefined || typeof node === "boolean") {
      return true;
    }
    if (typeof node === "string" || typeof node === "number") {
      parts.push(String(node));
      return true;
    }
    if (Array.isArray(node)) {
      return node.every((child) => walk(child));
    }
    if (isValidElement<{ children?: ReactNode }>(node)) {
      const nested = node.props.children;
      // A childless element (an icon, an image) can't be spelled as a string.
      if (nested === undefined || nested === null) {
        return false;
      }
      return Children.toArray(nested).every((child) => walk(child));
    }
    return false;
  };

  if (!walk(children)) {
    return null;
  }

  const label = parts.join("").trim();

  return label.length > 0 ? label : null;
}
