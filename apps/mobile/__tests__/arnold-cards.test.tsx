/**
 * Arnold's cards (ADR 0027), behind the Arnold redesign flag: the real
 * Arnold screen over the fake Arnold, with stand-in cards in the card
 * registry. A send reads the announced cards and the device's time zone off
 * the wire, and a registered show tool's successful result is drawn as its
 * card at full width outside Arnold's bubble. A failed call and a tool the
 * build doesn't register draw nothing, and with the flag off nothing changes.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import {
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Text } from "react-native";

import ArnoldScreen from "~/app/(tabs)/arnold/index";
import { ARNOLD_BUBBLE } from "~/components/chat";
import { ARNOLD_CARDS } from "~/components/chat/cards/lookup";
import type {
  ArnoldCardProps,
  ArnoldCardRegistry,
} from "~/components/chat/cards/registry";
import { setArnoldRedesignEnabled } from "~/lib/feature-flags";
import { storage } from "~/lib/mmkv";
import { setDeviceTimeZone } from "~/test-utils/device-locales";
import { FAKE_ARNOLD_REPLY, fakeArnold } from "~/test-utils/fake-arnold";
import type { FakeToolCall } from "~/test-utils/fake-arnold";
import type * as InMemoryFileSystem from "~/test-utils/in-memory-file-system";
import { createTestQueryClient, settle } from "~/test-utils/query-client";
import { resetStubRouter } from "~/test-utils/router-stub";

/** The registry each test fills with its own stand-in cards. */
jest.mock("~/components/chat/cards/registry", () => ({
  arnoldCardRegistry: {},
}));

const { arnoldCardRegistry: registry } = jest.requireMock<{
  arnoldCardRegistry: ArnoldCardRegistry;
}>("~/components/chat/cards/registry");

jest.mock("react-native-keyboard-controller", () =>
  jest.requireActual("react-native-keyboard-controller/jest")
);

jest.mock("react-native-worklets", () =>
  jest.requireActual("react-native-worklets/lib/module/mock")
);

// Animations as plain views and values: the screen's layout isn't under test.
jest.mock("react-native-reanimated", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");

  const transition = { duration: () => transition };

  return {
    __esModule: true,
    default: {
      createAnimatedComponent: <T,>(component: T) => component,
      View,
    },
    createAnimatedComponent: <T,>(component: T) => component,
    FadeIn: transition,
    FadeOut: transition,
    runOnJS: <T,>(fn: T) => fn,
    useAnimatedProps: () => ({}),
    useAnimatedStyle: () => ({}),
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
    useSharedValue: <T,>(value: T) => ({ value }),
    withTiming: <T,>(value: T) => value,
  };
});

// The list renders its rows without layout.
jest.mock("@legendapp/list/react-native", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    LegendList: <T,>({
      data,
      keyExtractor,
      ListFooterComponent,
      renderItem,
    }: {
      data: readonly T[];
      keyExtractor: (item: T) => string;
      ListFooterComponent: ReactNode;
      renderItem: (info: { item: T }) => ReactNode;
    }) => (
      <View>
        {data.map((item) => (
          <View key={keyExtractor(item)}>{renderItem({ item })}</View>
        ))}
        {ListFooterComponent}
      </View>
    ),
  };
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock("~/components/touchable-glass", () => {
  const { Pressable } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return { TouchableGlass: Pressable };
});

/** The plan card, as the text naming its plan: shown as today or not. */
jest.mock("~/components/chat/workout-plan-card", () => {
  const { Text: RNText } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    WorkoutPlanCard: ({ plan }: { plan: { name: string } }) => (
      <RNText>{`Plan card: ${plan.name}`}</RNText>
    ),
  };
});

jest.mock("~/components/markdown", () => {
  const { Text: RNText } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    ChatMarkdown: ({ children }: { children: string }) => (
      <RNText>{children}</RNText>
    ),
  };
});

jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ user: { id: "user_arnold_edits" } }),
}));

jest.mock("~/lib/clerk", () => ({
  getClerk: () => ({
    session: { getToken: () => Promise.resolve("fake-arnold-token") },
  }),
}));

jest.mock("~/lib/arnold-attachment-picker", () => ({
  pickLibraryPhotos: jest.fn(),
  readAttachmentDataUrl: jest.fn(),
  takePhoto: jest.fn(),
}));

jest.mock(
  "expo-file-system",
  () =>
    jest.requireActual<typeof InMemoryFileSystem>(
      "~/test-utils/in-memory-file-system"
    ).fileSystemModule
);

const { fileSystem } = jest.requireActual<typeof InMemoryFileSystem>(
  "~/test-utils/in-memory-file-system"
);

jest.mock("expo-router/react-navigation", () => ({ useHeaderHeight: () => 0 }));

jest.mock("~/hooks/revenueCat", () => ({
  useIsProQuery: () => ({ data: true, isPending: false }),
}));

jest.mock("~/hooks/arnold-model", () => ({
  useSelectedArnoldModel: () => ({ model: undefined }),
}));

jest.mock("react-native-purchases-ui", () => ({
  __esModule: true,
  default: { presentPaywall: jest.fn() },
}));

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light" },
  impactAsync: jest.fn(),
}));

jest.mock("expo-router", () => {
  const stub = jest.requireActual<typeof import("~/test-utils/router-stub")>(
    "~/test-utils/router-stub"
  );

  return {
    Link: stub.LinkStub,
    Stack: { Screen: () => null },
    usePreventRemove: () => undefined,
    useLocalSearchParams: () => stub.useStubParams({}),
    useRouter: () => ({ ...stub.stubRouter, setParams: jest.fn() }),
  };
});

// Each test runs a whole turn through the real eve runtime.
jest.setTimeout(30_000);

const COMPOSER = "Message Arnold";
const SEND = "Send message";

/** A stand-in card: the text naming what it was drawn from. */
const standInCard =
  (name: string) =>
  ({ input, result }: ArnoldCardProps) => (
    <Text>{`${name} card: ${JSON.stringify({ input, result })}`}</Text>
  );

const shownWorkout: FakeToolCall = {
  input: { workout_id: "workout-1" },
  name: "show_workout",
  output: { plan_id: "plan-1", workout_id: "workout-1" },
};

const WORKOUT_CARD = `Workout card: ${JSON.stringify({
  input: shownWorkout.input,
  result: { plan_id: "plan-1", workout_id: "workout-1" },
})}`;

let queryClient: QueryClient;

const mount = async () => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <ArnoldScreen />
    </QueryClientProvider>
  );
  await settle(queryClient);
};

/** Sends `text` and waits for Arnold's answer. */
const send = async (text: string) => {
  const answers = screen.queryAllByText(FAKE_ARNOLD_REPLY).length;
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText(COMPOSER), text);
  await user.press(screen.getByLabelText(SEND));
  await waitFor(() => {
    expect(screen.queryAllByText(FAKE_ARNOLD_REPLY)).toHaveLength(answers + 1);
  });
  await settle(queryClient);
};

beforeEach(() => {
  storage.clearAll();
  fileSystem.reset();
  resetStubRouter();

  delete registry.show_workout;
  delete registry.show_plan;

  fakeArnold.install();
  process.env.EXPO_PUBLIC_ARNOLD_URL = fakeArnold.baseUrl;
  setArnoldRedesignEnabled(true);
});

const registerCards = () => {
  registry.show_workout = { announced: true, Card: standInCard("Workout") };
  // Drawn, but never offered to Arnold.
  registry.show_plan = { announced: false, Card: standInCard("Plan") };
};

describe("the client context", () => {
  it("carries an empty list of cards and the device's time zone with an empty registry", async () => {
    setDeviceTimeZone("Europe/Kyiv");
    await mount();
    await send("Hi");

    expect(fakeArnold.sent.at(-1)?.clientContext).toEqual({
      cards: [],
      language: "en",
      timeZone: "Europe/Kyiv",
    });
  });

  it("lists only the announced cards", async () => {
    registerCards();
    await mount();
    await send("Hi");

    expect(fakeArnold.sent.at(-1)?.clientContext).toEqual({
      cards: ["workout"],
      language: "en",
      timeZone: "UTC",
    });
  });

  it("is today's with the Arnold redesign off", async () => {
    setArnoldRedesignEnabled(false);
    registerCards();
    await mount();
    await send("Hi");

    expect(fakeArnold.sent.at(-1)?.clientContext).toEqual({ language: "en" });
  });
});

describe("a card", () => {
  it("is drawn for a successful result, at full width outside Arnold's bubble", async () => {
    registerCards();
    await mount();
    fakeArnold.callToolsNextTurn([shownWorkout]);
    await send("Show my workout");

    const cards = screen.getByTestId(ARNOLD_CARDS);

    expect(within(cards).getByText(WORKOUT_CARD)).toBeTruthy();

    for (const bubble of screen.getAllByTestId(ARNOLD_BUBBLE)) {
      expect(within(bubble).queryByText(WORKOUT_CARD)).toBeNull();
    }

    expect(
      screen
        .getAllByTestId(ARNOLD_BUBBLE)
        .some((bubble) => within(bubble).queryByText(FAKE_ARNOLD_REPLY))
    ).toBe(true);
  });

  it("is drawn though it isn't announced", async () => {
    registerCards();
    await mount();
    fakeArnold.callToolsNextTurn([
      {
        input: { plan_id: "plan-1" },
        name: "show_plan",
        output: { plan_id: "plan-1" },
      },
    ]);
    await send("Show my plan");

    expect(
      within(screen.getByTestId(ARNOLD_CARDS)).getByText(
        `Plan card: ${JSON.stringify({
          input: { plan_id: "plan-1" },
          result: { plan_id: "plan-1" },
        })}`
      )
    ).toBeTruthy();
  });

  it.each<{ call: FakeToolCall; name: string }>([
    {
      call: {
        error: "No such Workout",
        input: { workout_id: "workout-1" },
        name: "show_workout",
      },
      name: "a failed call",
    },
    {
      call: { input: {}, name: "show_profile", output: {} },
      name: "a tool the build doesn't register",
    },
  ])("isn't drawn for $name", async ({ call }) => {
    registerCards();
    await mount();
    fakeArnold.callToolsNextTurn([call]);
    await send("Show it");

    expect(screen.queryByTestId(ARNOLD_CARDS)).toBeNull();
  });

  it("isn't drawn with the Arnold redesign off", async () => {
    setArnoldRedesignEnabled(false);
    registerCards();
    await mount();
    fakeArnold.callToolsNextTurn([shownWorkout]);
    await send("Show my workout");

    expect(screen.queryByTestId(ARNOLD_CARDS)).toBeNull();
    expect(screen.queryByText(WORKOUT_CARD)).toBeNull();
  });
});
