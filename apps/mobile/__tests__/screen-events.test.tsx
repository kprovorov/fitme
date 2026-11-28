/**
 * Screen events (FIT-878): the root layout records one screen event per
 * focused route, named by the route template, on the real expo-router.
 */
import { describe, expect, it } from "@jest/globals";
import { act, fireEvent, screen } from "@testing-library/react-native";
import { router, Stack, Tabs } from "expo-router";
import type { Href } from "expo-router";
import { useState } from "react";
import { Pressable, Text } from "react-native";

import { screenNameOf, useScreenEvents } from "~/hooks/screen-events";
import { sentAnalytics } from "~/test-utils/fake-analytics";
import { renderRouter } from "~/test-utils/render-router";

const Layout = () => {
  useScreenEvents();

  return <Stack screenOptions={{ headerShown: false }} />;
};

// The app's tabs are native ones, which can't mount under Jest; expo-router's
// JS tabs route the same `(tabs)` group.
const TabsLayout = () => (
  <Tabs screenOptions={{ headerShown: false }}>
    <Tabs.Screen name="(home)/index" />
    <Tabs.Screen name="history" />
  </Tabs>
);

const Home = () => <Text>Home</Text>;
const History = () => <Text>History</Text>;

/** A screen that re-renders itself without navigating. */
const PlanScreen = () => {
  const [count, setCount] = useState(0);

  return (
    <Pressable onPress={() => setCount((value) => value + 1)}>
      <Text>Plan {count}</Text>
    </Pressable>
  );
};

const ModalScreen = () => <Text>Modal</Text>;

const ModalLayout = () => {
  useScreenEvents();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="muscles" options={{ presentation: "modal" }} />
    </Stack>
  );
};

const open = async (layout: () => React.JSX.Element = Layout) => {
  await renderRouter(
    {
      "(tabs)/_layout": TabsLayout,
      "(tabs)/history": History,
      "(tabs)/(home)/index": Home,
      _layout: layout,
      muscles: ModalScreen,
      "plans/[planId]": PlanScreen,
    },
    "/"
  );
};

const go = async (navigate: () => void) => {
  await act(async () => {
    navigate();
    await Promise.resolve();
  });
};

const push = (href: Href) => go(() => router.push(href));

describe("screen events", () => {
  it("records the opening screen once, by its route template", async () => {
    await open();

    expect(sentAnalytics.screens()).toEqual(["/(tabs)/(home)"]);
    expect(screenNameOf([])).toBe("/");
  });

  it("records nothing for a re-render without navigation", async () => {
    await open();
    await push("/plans/plan-one-id");
    await fireEvent.press(screen.getByText("Plan 0"));
    await fireEvent.press(screen.getByText("Plan 1"));

    expect(screen.getByText("Plan 2")).toBeTruthy();
    expect(sentAnalytics.screens()).toEqual([
      "/(tabs)/(home)",
      "/plans/[planId]",
    ]);
  });

  it("records a tab when it's switched to", async () => {
    await open();
    await go(() => router.navigate("/history"));

    expect(screen.getByText("History")).toBeTruthy();

    await go(() => router.navigate("/"));

    expect(sentAnalytics.screens()).toEqual([
      "/(tabs)/(home)",
      "/(tabs)/history",
      "/(tabs)/(home)",
    ]);
  });

  it("names two Plans' screens the same, with no id anywhere", async () => {
    await open();
    await push("/plans/plan-one-id");
    await push("/plans/plan-two-id?search=squat");

    expect(sentAnalytics.screens()).toEqual([
      "/(tabs)/(home)",
      "/plans/[planId]",
      "/plans/[planId]",
    ]);
    expect(JSON.stringify(sentAnalytics.clients())).not.toMatch(
      /plan-one-id|plan-two-id|squat/u
    );
    expect(JSON.stringify(sentAnalytics.events())).not.toMatch(
      /plan-one-id|plan-two-id|squat/u
    );
  });

  it("records each screen again as it's focused going back", async () => {
    await open();
    await push("/plans/plan-one-id");
    await go(() => router.back());

    expect(sentAnalytics.screens()).toEqual([
      "/(tabs)/(home)",
      "/plans/[planId]",
      "/(tabs)/(home)",
    ]);
  });

  it("records a modal like any other route", async () => {
    await open(ModalLayout);
    await push("/muscles");

    expect(screen.getByText("Modal")).toBeTruthy();

    await go(() => router.back());

    expect(sentAnalytics.screens()).toEqual([
      "/(tabs)/(home)",
      "/muscles",
      "/(tabs)/(home)",
    ]);
  });
});
