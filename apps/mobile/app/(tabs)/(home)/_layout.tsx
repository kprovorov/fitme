import { Stack } from "expo-router";

import { SCROLL_EDGE_EFFECTS } from "~/lib/constants";

const Layout = () => (
  <Stack screenOptions={{ scrollEdgeEffects: SCROLL_EDGE_EFFECTS }} />
);

export default Layout;
