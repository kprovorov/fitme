import { isLiquidGlassAvailable } from "expo-glass-effect";
import type React from "react";
import { useCallback, useState } from "react";
import { TouchableWithoutFeedback } from "react-native";
import type { ViewProps } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { BlurViewRawBackdrop } from "./blur-raw";
import { AppleGlassView } from "./tw";
import type { FallbackAppleGlassViewProps } from "./tw";

type GlassViewProps = FallbackAppleGlassViewProps;

type TouchableGlassProps = Omit<GlassViewProps, "children"> & {
  children?: React.ReactNode;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  disabled?: boolean;
};

const createTapGesture = ({
  onPress,
  onPressIn,
  onPressOut,
  disabled,
}: Pick<
  TouchableGlassProps,
  "onPress" | "onPressIn" | "onPressOut" | "disabled"
>) =>
  Gesture.Tap()
    .enabled(!disabled)
    .onBegin(() => {
      if (onPressIn) {
        scheduleOnRN(onPressIn);
      }
    })
    .onEnd((_e, success) => {
      if (success && onPress) {
        scheduleOnRN(onPress);
      }
    })
    .onFinalize(() => {
      if (onPressOut) {
        scheduleOnRN(onPressOut);
      }
    });

const TouchableGlassNative = ({
  onPress,
  onPressIn,
  onPressOut,
  disabled,
  ref,
  ...rest
}: TouchableGlassProps) => {
  const tap = createTapGesture({ onPress, onPressIn, onPressOut, disabled });

  return (
    <GestureDetector gesture={tap}>
      <AppleGlassView
        collapsable={false}
        isInteractive={!disabled}
        ref={ref}
        {...rest}
      />
    </GestureDetector>
  );
};

const TouchableGlassFallback = ({
  onPress,
  onPressIn,
  onPressOut,
  ref,
  disabled,

  children,
  style,
  className,
  ...rest
}: TouchableGlassProps) => {
  // Keep glass-only props off the fallback's native view.
  const viewProps = { ...rest };
  delete viewProps.fallbackTint;
  delete viewProps.fallbackIntensity;
  delete viewProps.glassEffectStyle;
  delete viewProps.tintColor;
  delete viewProps.isInteractive;
  delete viewProps.colorScheme;
  delete viewProps.animatedProps;
  const [pressed, setPressed] = useState(false);

  const onTouchBegin = useCallback(() => {
    setPressed(true);
    onPressIn?.();
  }, [onPressIn]);

  const onTouchEnd = useCallback(() => {
    setPressed(false);
    onPressOut?.();
  }, [onPressOut]);

  const onTouchEndSuccess = useCallback(() => {
    setPressed(false);
    onPress?.();
    onPressOut?.();
  }, [onPress, onPressOut]);

  return (
    <TouchableWithoutFeedback
      className="contents"
      disabled={disabled}
      onPress={onTouchEndSuccess}
      onPressIn={onTouchBegin}
      onPressOut={onTouchEnd}
    >
      <Animated.View
        className={className}
        ref={ref}
        // SAFETY: Glass-only and animated props were removed above; this fallback forwards native View props.
        {...(viewProps as ViewProps)}
        style={[
          {
            overflow: "hidden",
            transitionDuration: "150ms",
            transitionProperty: ["transform", "opacity"],
            transitionTimingFunction: "ease-in-out",
          },
          pressed && { transform: [{ scale: 1.1 }] },
          disabled && { opacity: 0.5 },
          style,
        ]}
      >
        <BlurViewRawBackdrop />
        {children}
      </Animated.View>
    </TouchableWithoutFeedback>
  );
};

export const TouchableGlass = isLiquidGlassAvailable()
  ? TouchableGlassNative
  : TouchableGlassFallback;
