import { Stack } from "expo-router";

import { SCROLL_EDGE_EFFECTS } from "~/lib/constants";

/**
 * The Plan editor's own stack, inside the modal the root layout presents, so
 * the Workout editor can be pushed over the Plan's.
 */
export default function PlanEditorLayout() {
  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: "minimal",
        headerTitleStyle: {
          fontFamily: "NunitoSans12pt-Bold",
          fontWeight: "bold",
        },
        headerTransparent: true,
        scrollEdgeEffects: SCROLL_EDGE_EFFECTS,
      }}
    />
  );
}
