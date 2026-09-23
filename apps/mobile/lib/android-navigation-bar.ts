import { NavigationBar } from "expo-navigation-bar";
import { Platform } from "react-native";

export function setAndroidNavigationBar(theme: "light" | "dark") {
  if (Platform.OS !== "android") {
    return;
  }
  // Edge-to-edge is always on, so the bar background is transparent and only
  // the button style can be changed.
  NavigationBar.setStyle(theme === "dark" ? "light" : "dark");
}
