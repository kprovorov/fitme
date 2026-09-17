import { useColorScheme as useRNColorScheme } from "react-native";
import { Uniwind } from "uniwind";

export function useColorScheme() {
  const colorScheme = useRNColorScheme() ?? "dark";
  return {
    colorScheme,
    isDarkColorScheme: colorScheme === "dark",
    setColorScheme: (scheme: "light" | "dark") => Uniwind.setTheme(scheme),
    toggleColorScheme: () =>
      Uniwind.setTheme(colorScheme === "dark" ? "light" : "dark"),
  };
}
