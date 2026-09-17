"use client";

import type { BlurViewProps } from "expo-blur";
import { NativeBlurView } from "expo-blur/build/NativeBlurModule";
import { StyleSheet } from "react-native";

export function BlurViewRawBackdrop({
  tint = "default",
  intensity = 50,
  blurReductionFactor = 4,
  experimentalBlurMethod = "none",
  style,
  children,
  ...props
}: BlurViewProps) {
  return (
    <NativeBlurView
      blurReductionFactor={blurReductionFactor}
      experimentalBlurMethod={experimentalBlurMethod}
      intensity={intensity}
      style={{
        ...StyleSheet.absoluteFillObject,
        overflow: "hidden",
      }}
      tint={tint}
      {...props}
    />
  );
}
