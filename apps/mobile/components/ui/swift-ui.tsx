import { Host } from "@expo/ui/swift-ui";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { isValidElement } from "react";
import type { ReactNode } from "react";
import { Platform } from "react-native";
import { useResolveClassNames, withUniwind } from "uniwind";
import { z } from "zod";

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
  Platform.OS !== "ios" || Math.trunc(Number(String(Platform.Version))) >= 17;

/**
 * SwiftUI's `.infinity` can't cross the bridge, but `.frame(maxWidth:)` is
 * clamped to the size the parent proposes, so a large finite value behaves
 * identically inside a bounded host.
 */
export const FILL = 10_000;

/** `Host` with Uniwind's `className` -> `style` mapping applied. */
export const SwiftUIHost = withUniwind(Host);

/** Class names that make a control span the width its parent hands it. */
const STRETCH_CLASS = /\b(?:w-full|flex-1|self-stretch|grow)\b/u;

export const isStretchClassName = (className?: string): boolean =>
  !!className && STRETCH_CLASS.test(className);

/**
 * SwiftUI colors come from the same tokens the rest of the app uses
 * (`--color-*` in `@fitme/design-tokens`), resolved through Uniwind, so every
 * native control's tint follows the token: there is no copy of a value here.
 */
export const useSwiftUITheme = () => {
  const primary = useResolveClassNames("text-primary");
  const primaryForeground = useResolveClassNames("text-primary-foreground");
  const secondary = useResolveClassNames("text-secondary");
  const secondaryForeground = useResolveClassNames("text-secondary-foreground");
  const destructive = useResolveClassNames("text-destructive");
  const foreground = useResolveClassNames("text-foreground");
  const card = useResolveClassNames("text-card");
  const border = useResolveClassNames("text-border");
  const mutedForeground = useResolveClassNames("text-muted-foreground");

  return {
    // SAFETY: text-border resolves the design token's CSS color string.
    border: border.color as string,
    // SAFETY: text-card resolves the design token's CSS color string.
    card: card.color as string,
    // SAFETY: text-destructive resolves the design token's CSS color string.
    destructive: destructive.color as string,
    // SAFETY: text-foreground resolves the design token's CSS color string.
    foreground: foreground.color as string,
    // SAFETY: text-muted-foreground resolves the design token's CSS color string.
    mutedForeground: mutedForeground.color as string,
    // SAFETY: text-primary resolves the design token's CSS color string.
    primary: primary.color as string,
    // SAFETY: text-primary-foreground resolves the design token's CSS color string.
    primaryForeground: primaryForeground.color as string,
    // SAFETY: text-secondary resolves the design token's CSS color string.
    secondary: secondary.color as string,
    // SAFETY: text-secondary-foreground resolves the design token's CSS color string.
    secondaryForeground: secondaryForeground.color as string,
  };
};

/**
 * Resolves a text style utility (`text-body-emphasized`) into the family and
 * size SwiftUI's `font` modifier wants, so native controls use the same type
 * scale as the rest of the app (`@fitme/design-tokens`).
 */
/**
 * The color a color class (`text-primary`) resolves to, or `undefined`
 * without one. `useResolveClassNames("")` keeps answering the last class it
 * resolved, so a control that drops its color class would keep the old color:
 * it's only read while there's a class.
 */
export const useClassColor = (className: string | undefined) => {
  // SAFETY: color utilities resolve to CSS color strings; other classes omit color.
  const resolved = useResolveClassNames(className ?? "").color as
    | string
    | undefined;

  return className ? resolved : undefined;
};

export const useSwiftUIFont = (className: string) => {
  const style = useResolveClassNames(className);

  return {
    family: style.fontFamily,
    size: style.fontSize,
  };
};

const labelTextSchema = z.union([
  z.string(),
  z.number(),
  z.nan(),
  z.literal([Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]),
]);

const isLabelIterable = (node: ReactNode): node is Iterable<ReactNode> =>
  node !== null &&
  typeof node === "object" &&
  Symbol.iterator in node &&
  typeof node[Symbol.iterator] === "function";

/**
 * Collapses a React subtree into a plain string, so callers can keep passing
 * `<Text>Save</Text>` to controls that need SwiftUI's string `label`.
 * Returns `null` when the subtree holds anything a string can't represent
 * (an icon, an image), which is the signal to host the children natively.
 */
export const childrenToLabel = (children: ReactNode): string | null => {
  const parts: string[] = [];

  const walk = (node: ReactNode, nestedChildren = false): boolean => {
    if (
      node === null ||
      node === undefined ||
      node === true ||
      node === false
    ) {
      return true;
    }

    const text = labelTextSchema.safeParse(node);

    if (text.success) {
      parts.push(String(text.data));

      return true;
    }

    if (Array.isArray(node)) {
      return node.every((child) => walk(child, nestedChildren));
    }

    if (nestedChildren && isLabelIterable(node)) {
      return [...node].every((child) => walk(child, true));
    }

    if (isValidElement<{ children?: ReactNode }>(node)) {
      const nested = node.props.children;

      // A childless element (an icon, an image) can't be spelled as a string.
      if (nested === undefined || nested === null) {
        return false;
      }

      return walk(nested, true);
    }

    return false;
  };

  if (!walk(children)) {
    return null;
  }

  const label = parts.join("").trim();

  return label.length > 0 ? label : null;
};
