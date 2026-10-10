import { Stack } from "expo-router";
import { SCROLL_EDGE_EFFECTS } from "~/lib/constants";

export default function Layout() {
  return <Stack screenOptions={{ scrollEdgeEffects: SCROLL_EDGE_EFFECTS }} />;
}
