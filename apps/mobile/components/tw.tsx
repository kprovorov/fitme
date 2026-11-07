import { BlurView as EXBlurView } from "expo-blur";
import {
  isLiquidGlassAvailable,
  GlassView as XGlassView,
} from "expo-glass-effect";
import type { StyleProp, ViewProps, ViewStyle } from "react-native";
import { KeyboardGestureArea as XKeyboardGestureArea } from "react-native-keyboard-controller";
import { createAnimatedComponent } from "react-native-reanimated";
import { SafeAreaView as XSafeAreaView } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";

const StyledSafeAreaView = withUniwind(XSafeAreaView);

export const SafeAreaView = (
  props: React.ComponentProps<typeof StyledSafeAreaView>
) => <StyledSafeAreaView {...props} />;

export { Image } from "./image";

const StyledKeyboardGestureArea = withUniwind(XKeyboardGestureArea);

export const KeyboardGestureArea = (
  props: React.ComponentProps<typeof StyledKeyboardGestureArea>
) => <StyledKeyboardGestureArea {...props} />;

const AnimatedEXGlassView = createAnimatedComponent(XGlassView);

const BlurView = withUniwind(EXBlurView);

const GLASS_ENABLED = isLiquidGlassAvailable();

type AnimatedGlassViewProps = React.ComponentProps<typeof AnimatedEXGlassView>;

type FlatGlassStyle = Exclude<
  Extract<AnimatedGlassViewProps["style"], object>,
  readonly AnimatedGlassViewProps["style"][]
>;

// Keep Expo's web style additions and Reanimated's values while merging arrays.
// It returns a copy: the caller's style object is never mutated.
const flattenStyle = (
  style: AnimatedGlassViewProps["style"]
): FlatGlassStyle => {
  if (Array.isArray(style)) {
    const flat: FlatGlassStyle = {};

    for (const item of style) {
      Object.assign(flat, flattenStyle(item));
    }

    return flat;
  }

  // SAFETY: Array.isArray handled every array (including readonly arrays);
  // the remaining truthy style is a single style object copied without mutation.
  // oxlint-disable-next-line typescript/no-misused-spread -- Array.isArray flattened readonly arrays above; this branch copies one style object.
  return style ? { ...(style as FlatGlassStyle) } : {};
};

const convertStylesToProps = (style: AnimatedGlassViewProps["style"]) => {
  if (!style) {
    return { props: {}, style };
  }

  const flatStyle = flattenStyle(style);

  if ("backgroundColor" in flatStyle) {
    const { backgroundColor, ...remainingStyle } = flatStyle;

    // SAFETY: The native glass adapter moves the background color unchanged
    // into the native tint prop; both consume React Native color values.
    const tintColor = backgroundColor as AnimatedGlassViewProps["tintColor"];

    return { props: { tintColor }, style: remainingStyle };
  }

  return { props: {}, style: flatStyle };
};

const BetterGlassView = (props: AnimatedGlassViewProps) => {
  const { style, props: converted } = convertStylesToProps(props.style);

  return <AnimatedEXGlassView {...{ ...props, style, ...converted }} />;
};

const StyledInnerAppleGlassView = withUniwind(BetterGlassView);

export const InnerAppleGlassView = (
  props: React.ComponentProps<typeof StyledInnerAppleGlassView>
) => <StyledInnerAppleGlassView {...props} />;

export type FallbackAppleGlassViewProps = React.ComponentProps<
  typeof AnimatedEXGlassView
> & {
  className?: string;
  fallbackTint?: React.ComponentProps<typeof EXBlurView>["tint"];
  fallbackIntensity?: React.ComponentProps<typeof EXBlurView>["intensity"];
};

const FallbackAppleGlassView = ({
  fallbackTint,
  fallbackIntensity,
  children,
  style,
  className,
  ref,
  // Glass-only props have no BlurView equivalent; keep them off the native view.
  glassEffectStyle: _glassEffectStyle,
  tintColor: _tintColor,
  isInteractive: _isInteractive,
  colorScheme: _colorScheme,
  animatedProps: _animatedProps,
  ...viewProps
}: FallbackAppleGlassViewProps) => (
  <BlurView
    className={className}
    intensity={fallbackIntensity}
    // SAFETY: Both instances support native view refs; the fallback intentionally
    // resolves AppleGlassView's public glass ref to the BlurView instance.
    ref={ref as React.Ref<EXBlurView>}
    // SAFETY: BlurView accepts the same ViewStyle keys; the fallback forwards
    // Reanimated's style representation unchanged, as it does for view props.
    style={[{ overflow: "hidden" }, style as StyleProp<ViewStyle>]}
    tint={fallbackTint}
    // SAFETY: Glass-only props were removed above; the rest are native view props
    // forwarded unchanged on this non-animated fallback path.
    {...(viewProps as ViewProps)}
  >
    {
      // SAFETY: The non-animated fallback renders the same React children;
      // it does not resolve Reanimated's shared-value prop representation.
      children as React.ReactNode
    }
  </BlurView>
);

export const AppleGlassView = GLASS_ENABLED
  ? InnerAppleGlassView
  : FallbackAppleGlassView;

const StyledGlassView = withUniwind(XGlassView);

export const GlassView = (
  props: React.ComponentProps<typeof StyledGlassView>
) => <StyledGlassView {...props} />;
