import { DarkTheme } from "expo-router/react-navigation";
import type { Theme } from "expo-router/react-navigation";
import { useMemo } from "react";
import { useCSSVariable } from "uniwind";

/**
 * React Navigation's dark theme on the design tokens: the Screen background
 * and the brand lime come from `--color-background` and `--color-primary`,
 * never a copy of their values.
 */
export const useNavigationTheme = (): Theme => {
  // SAFETY: tokens.css, imported by global.css, defines this token as a hex color string.
  const background = useCSSVariable("--color-background") as string;
  // SAFETY: tokens.css, imported by global.css, defines this token as a hex color string.
  const primary = useCSSVariable("--color-primary") as string;

  return useMemo(
    () => ({
      ...DarkTheme,
      colors: { ...DarkTheme.colors, background, primary },
    }),
    [background, primary]
  );
};
