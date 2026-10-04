import { BlurView as EXBlurView } from "expo-blur";
import {
  isLiquidGlassAvailable,
  GlassView as XGlassView,
} from "expo-glass-effect";
import { Image as XImage } from "expo-image";
import { StyleSheet, type ViewProps, type ViewStyle } from "react-native";
import { KeyboardGestureArea as XKeyboardGestureArea } from "react-native-keyboard-controller";
import Animated from "react-native-reanimated";
import { SafeAreaView as XSafeAreaView } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";

export const SafeAreaView = withUniwind(XSafeAreaView);

export const Image = withUniwind(XImage);
export const KeyboardGestureArea = withUniwind(XKeyboardGestureArea);

const AnimatedEXGlassView = Animated.createAnimatedComponent(XGlassView);

const BlurView = withUniwind(EXBlurView);

export const InnerAppleGlassView = withUniwind(BetterGlassView);
const GLASS_ENABLED = isLiquidGlassAvailable();

type FallbackAppleGlassViewProps = React.ComponentProps<
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
    // AppleGlassView is picked per platform but exposes the glass view's ref
    // type; on this fallback path the ref resolves to the BlurView instance.
    ref={ref as React.Ref<EXBlurView>}
    style={[{ overflow: "hidden" }, StyleSheet.flatten(style) as ViewStyle]}
    tint={fallbackTint}
    {...(viewProps as ViewProps)}
  >
    {children as React.ReactNode}
  </BlurView>
);

export const AppleGlassView = GLASS_ENABLED
  ? InnerAppleGlassView
  : FallbackAppleGlassView;

function BetterGlassView(
  props: React.ComponentProps<typeof AnimatedEXGlassView>
) {
  const { style, props: converted } = convertStylesToProps(props.style, {
    backgroundColor: "tintColor",
  });

  return <AnimatedEXGlassView {...{ ...props, style, ...converted }} />;
}

export const GlassView = withUniwind(XGlassView);

function convertStylesToProps(
  style: React.ComponentProps<typeof AnimatedEXGlassView>["style"],
  move: Record<string, string>
) {
  if (!style) {
    return { props: {} as Record<string, unknown>, style };
  }
  const flatStyle = (StyleSheet.flatten(style) || {}) as Record<
    string,
    unknown
  >;
  const props: Record<string, unknown> = {};

  for (const [styleKey, propKey] of Object.entries(move)) {
    if (styleKey in flatStyle) {
      props[propKey] = flatStyle[styleKey];
      delete flatStyle[styleKey];
    }
  }

  return { props, style: flatStyle };
}
