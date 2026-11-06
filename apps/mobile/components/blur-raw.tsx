"use client";

import type { BlurViewProps } from "expo-blur";
import { NativeBlurView } from "expo-blur/build/NativeBlurModule";
import { withUniwind } from "uniwind";

const StyledNativeBlurView = withUniwind(NativeBlurView);

export const BlurViewRawBackdrop = ({
  tint = "default",
  intensity = 50,
  blurReductionFactor = 4,
  experimentalBlurMethod = "none",
  style: _style,
  children: _children,
  ...props
}: BlurViewProps) => (
  <StyledNativeBlurView
    blurReductionFactor={blurReductionFactor}
    className="absolute inset-0 overflow-hidden"
    experimentalBlurMethod={experimentalBlurMethod}
    intensity={intensity}
    tint={tint}
    {...props}
  />
);
