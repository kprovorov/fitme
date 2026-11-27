/**
 * Arnold removing a set from the open Workout Session
 * (`remove_set_from_workout_session`) reads that Workout Session again, so
 * the set shows as gone when the User is back on it (FIT-805). The real
 * Arnold screen over the fake Arnold, whose turn calls the tool, beside a
 * mounted read of the Workout Session over the fake Public API, whose
 * requests a test counts. An `{ error }` result, a failed call, another tool
 * and a reopened Conversation's replayed result read nothing.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import {
  render,
  screen,
  userEvent,
  waitFor,
} from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Text } from "react-native";

import ArnoldScreen from "~/app/(tabs)/arnold/index";
import {
  useOpenWorkoutSessionQuery,
  useWorkoutSessionQuery,
} from "~/hooks/queries/workout-sessions";
import { storage } from "~/lib/mmkv";
import { FAKE_ARNOLD_REPLY, fakeArnold } from "~/test-utils/fake-arnold";
import type { FakeToolCall } from "~/test-utils/fake-arnold";
import {
  backend,
  FAKE_USER_ID,
  fakePublicApi,
} from "~/test-utils/fake-public-api";
import type * as InMemoryFileSystem from "~/test-utils/in-memory-file-system";
import { createTestQueryClient, settle } from "~/test-utils/query-client";
import { resetStubRouter } from "~/test-utils/router-stub";

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
    useLocalSearchParams: () => stub.useStubParams({}),
    useRouter: () => ({ ...stub.stubRouter, setParams: jest.fn() }),
  };
});

// Each test runs a whole turn through the real eve runtime.
jest.setTimeout(30_000);

const SESSION_ID = "s1";
const SET_ID = "s1-e1-s2";
const SESSION_ROUTE = "GET /v1/workout-sessions/{id}";
const OPEN_SESSION_ROUTE = "GET /v1/workout-sessions";

const COMPOSER = "Message Arnold";
const SEND = "Send message";

/** What the tool answers when it removed the set. */
const removed: FakeToolCall = {
  input: { set_id: SET_ID },
  name: "remove_set_from_workout_session",
  output: { set_id: SET_ID, success: true },
};

/** The Workout Session's sets as a screen of it would show them. */
const SessionSets = () => {
  const { data } = useWorkoutSessionQuery({
    variables: { sessionId: SESSION_ID },
  });

  useOpenWorkoutSessionQuery();

  const sets = data?.exercises.flatMap((exercise) => exercise.sets);

  return <Text>{`Sets: ${sets?.length ?? "none read"}`}</Text>;
};

let queryClient: QueryClient;

const tree = ({ arnold = true, session = true }) => (
  <QueryClientProvider client={queryClient}>
    {arnold ? <ArnoldScreen /> : null}
    {session ? <SessionSets /> : null}
  </QueryClientProvider>
);

const mount = async ({ session = true }: { session?: boolean } = {}) => {
  queryClient = createTestQueryClient();
  const view = await render(tree({ session }));
  await settle(queryClient);

  return view;
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

/** Removes the set on the server, as Arnold's tool does. */
const removeOnServer = () => {
  backend.sets = backend.sets.filter((set) => set.id !== SET_ID);
};

const reads = () => fakePublicApi.count(SESSION_ROUTE);

beforeEach(() => {
  backend.reset();
  storage.clearAll();
  fileSystem.reset();
  resetStubRouter();
  backend.seedProfile(FAKE_USER_ID);
  backend.seed({
    exercises: [{ name: "Squat", sets: [8, null, null] }],
    id: SESSION_ID,
    workoutId: "workout-1",
  });
  fakeArnold.install();
  process.env.EXPO_PUBLIC_ARNOLD_URL = fakeArnold.baseUrl;
});

describe("a set Arnold removes from the open Workout Session", () => {
  it("reads the Workout Session again, so the set shows as gone", async () => {
    await mount();

    expect(screen.getByText("Sets: 3")).toBeTruthy();

    const before = reads();
    const openBefore = fakePublicApi.count(OPEN_SESSION_ROUTE);
    removeOnServer();
    fakeArnold.callToolsNextTurn([removed]);
    await send("Remove my second squat set");

    expect(screen.getByText("Sets: 2")).toBeTruthy();
    expect(reads()).toBe(before + 1);
    expect(fakePublicApi.count(OPEN_SESSION_ROUTE)).toBe(openBefore + 1);
  });

  it("leaves a Workout Session no screen shows stale, for the next one to open", async () => {
    await mount({ session: false });
    // Read once, as a screen that has since closed did.
    const key = useWorkoutSessionQuery.getKey({ sessionId: SESSION_ID });
    await queryClient.fetchQuery(
      useWorkoutSessionQuery.getFetchOptions({ sessionId: SESSION_ID })
    );

    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);

    fakeArnold.callToolsNextTurn([removed]);
    await send("Remove my second squat set");

    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it.each<{ call: FakeToolCall; name: string }>([
    {
      call: {
        input: { set_id: SET_ID },
        name: "remove_set_from_workout_session",
        output: {
          error: "Set not found: it doesn't exist or was already removed",
        },
      },
      name: "an { error } result",
    },
    {
      call: {
        error: "The database is down",
        input: { set_id: SET_ID },
        name: "remove_set_from_workout_session",
      },
      name: "a failed call",
    },
    {
      call: {
        input: { set_id: SET_ID },
        name: "remove_set_from_exercise",
        output: { success: true },
      },
      name: "another tool",
    },
  ])("reads nothing after $name", async ({ call }) => {
    await mount();
    const before = reads();
    fakeArnold.callToolsNextTurn([call]);
    await send("Remove a set");

    expect(reads()).toBe(before);
    expect(screen.getByText("Sets: 3")).toBeTruthy();
  });

  it("counts each result once: later turns and a reopened Conversation read nothing more", async () => {
    const view = await mount();
    fakeArnold.callToolsNextTurn([removed]);
    await send("Remove my second squat set");
    const afterRemoval = reads();
    await send("Thanks");

    expect(reads()).toBe(afterRemoval);

    // The Arnold screen closes and opens again on the saved Conversation,
    // which replays the removal, while the Workout Session stays read.
    await view.rerender(tree({ arnold: false }));
    await settle(queryClient);
    await view.rerender(tree({}));

    await waitFor(() => {
      expect(screen.getAllByText(FAKE_ARNOLD_REPLY)).toHaveLength(2);
    });
    await settle(queryClient);

    expect(reads()).toBe(afterRemoval);

    await send("And now?");

    expect(reads()).toBe(afterRemoval);
  });

  it("still shows the plan card", async () => {
    await mount();
    fakeArnold.callToolsNextTurn([
      {
        name: "display_workout_plan",
        output: { name: "Push Pull Legs", workouts: [] },
      },
    ]);
    await send("Make me a plan");

    expect(screen.getByText("Plan card: Push Pull Legs")).toBeTruthy();
  });
});
