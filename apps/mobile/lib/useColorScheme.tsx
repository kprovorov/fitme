import { useColorScheme as useRNColorScheme } from "react-native";
import { Uniwind } from "uniwind";

export function useColorScheme() {
  // biome-ignore lint/suspicious/noUnnecessaryConditions: React Native types it non-null, but it returns null without the native Appearance module
  const colorScheme = useRNColorScheme() ?? "dark";
  return {
    colorScheme,
    isDarkColorScheme: colorScheme === "dark",
    setColorScheme: (scheme: "light" | "dark") => Uniwind.setTheme(scheme),
    toggleColorScheme: () =>
      Uniwind.setTheme(colorScheme === "dark" ? "light" : "dark"),
  };
}
