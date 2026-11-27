/**
 * What Arnold changes is read again, so the User sees it when they're back
 * on the screen showing it: a set removed from the open Workout Session
 * (`remove_set_from_workout_session`, FIT-805), an Exercise note
 * (`set_exercise_note`) and a set's note (`set_workout_session_set_note`,
 * FIT-839). The real Arnold screen over the fake Arnold, whose turn calls the
 * tool, beside mounted reads over the fake Public API, whose requests a test
 * counts. An `{ error }` result, a failed call, another tool and a reopened
 * Conversation's replayed result read nothing.
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
import { ExerciseNote } from "~/components/notes/exercise-note";
import { useExerciseNotesQuery } from "~/hooks/queries/exercise-notes";
import { useExerciseHistoryQuery } from "~/hooks/queries/exercises";
import {
  useOpenWorkoutSessionQuery,
  useWorkoutSessionQuery,
} from "~/hooks/queries/workout-sessions";
import { setNotesEnabled } from "~/lib/feature-flags";
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
    usePreventRemove: () => undefined,
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

/** The Exercise notes as a screen of them would show them. */
const ExerciseNotes = () => {
  const { data } = useExerciseNotesQuery();

  return (
    <Text>{`Notes: ${data?.map((row) => row.note).join(", ") ?? "none read"}`}</Text>
  );
};

/** The set notes of the Exercise's history, as its Progress card reads them. */
const HistoryNotes = () => {
  const { data } = useExerciseHistoryQuery({
    variables: { exerciseSlug: "squat" },
  });

  const notes = data?.pages
    .flatMap((page) => page.data)
    .flatMap((entry) => entry.sets)
    .map((set) => set.note ?? "-");

  return <Text>{`History notes: ${notes?.join(", ") ?? "none read"}`}</Text>;
};

/** The Workout Session's set notes, as a screen of it would show them. */
const SessionNotes = () => {
  const { data } = useWorkoutSessionQuery({
    variables: { sessionId: SESSION_ID },
  });

  const notes = data?.exercises
    .flatMap((exercise) => exercise.sets)
    .map((set) => set.note ?? "-");

  return <Text>{`Set notes: ${notes?.join(", ") ?? "none read"}`}</Text>;
};

let queryClient: QueryClient;

interface Shown {
  arnold?: boolean;
  editor?: boolean;
  notes?: boolean;
  session?: boolean;
  setNotes?: boolean;
}

const tree = ({
  arnold = true,
  editor = false,
  notes = false,
  session = true,
  setNotes = false,
}: Shown) => (
  <QueryClientProvider client={queryClient}>
    {arnold ? <ArnoldScreen /> : null}
    {session ? <SessionSets /> : null}
    {notes ? <ExerciseNotes /> : null}
    {editor ? <ExerciseNote exerciseName="Squat" exerciseSlug="squat" /> : null}
    {setNotes ? (
      <>
        <SessionNotes />
        <HistoryNotes />
      </>
    ) : null}
  </QueryClientProvider>
);

const mount = async (shown: Shown = {}) => {
  queryClient = createTestQueryClient();
  const view = await render(tree(shown));
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
  setNotesEnabled(true);
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

const NOTES_ROUTE = "GET /v1/exercise-notes";
const HISTORY_ROUTE = "GET /v1/workout-session-exercises";
const LOGGED_SET_ID = "s1-e1-s1";

/** What `set_exercise_note` answers when it saved the note. */
const exerciseNoteSaved: FakeToolCall = {
  input: { current_note: "", exercise_slug: "squat", note: "Knees out" },
  name: "set_exercise_note",
  output: { exercise_slug: "squat", note: "Knees out", success: true },
};

/** What `set_workout_session_set_note` answers when it saved the note. */
const setNoteSaved: FakeToolCall = {
  input: { current_note: "", note: "Felt heavy", set_id: LOGGED_SET_ID },
  name: "set_workout_session_set_note",
  output: { note: "Felt heavy", success: true },
};

/** Saves the set's note on the server, as Arnold's tool does. */
const noteSetOnServer = (note: string) => {
  backend.sets = backend.sets.map((set) =>
    set.id === LOGGED_SET_ID ? { ...set, note } : set
  );
};

describe("a note Arnold writes on an Exercise", () => {
  it("reads the Exercise notes again, and nothing of the Workout Session", async () => {
    await mount({ notes: true });

    expect(screen.getByText("Notes: ")).toBeTruthy();

    const notesBefore = fakePublicApi.count(NOTES_ROUTE);
    const sessionBefore = reads();
    backend.seedExerciseNote("squat", "Knees out");
    fakeArnold.callToolsNextTurn([exerciseNoteSaved]);
    await send("Note on squat: knees out");

    expect(screen.getByText("Notes: Knees out")).toBeTruthy();
    expect(fakePublicApi.count(NOTES_ROUTE)).toBe(notesBefore + 1);
    expect(reads()).toBe(sessionBefore);
  });

  it("leaves the notes stale for the next screen to open when none shows them", async () => {
    await mount();
    const key = useExerciseNotesQuery.getKey();
    await queryClient.fetchQuery(useExerciseNotesQuery.getFetchOptions());

    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);

    fakeArnold.callToolsNextTurn([exerciseNoteSaved]);
    await send("Note on squat: knees out");

    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it("keeps the unsaved text of an open note editor", async () => {
    await mount({ editor: true });
    const user = userEvent.setup();
    await user.press(
      screen.getByRole("button", { name: "Add note for Squat" })
    );
    await user.type(screen.getByTestId("exercise-note-field"), "Mine");

    backend.seedExerciseNote("squat", "Knees out");
    fakeArnold.callToolsNextTurn([exerciseNoteSaved]);
    await send("Note on squat: knees out");

    expect(screen.getByTestId("exercise-note-field").props.value).toBe("Mine");
  });

  it.each<{ call: FakeToolCall; name: string }>([
    {
      call: {
        input: exerciseNoteSaved.input,
        name: "set_exercise_note",
        output: {
          current_note: "Elbows in",
          error: "The note changed since you read it; nothing was saved.",
        },
      },
      name: "an { error } result",
    },
    {
      call: {
        error: "The database is down",
        input: exerciseNoteSaved.input,
        name: "set_exercise_note",
      },
      name: "a failed call",
    },
  ])("reads nothing after $name", async ({ call }) => {
    await mount({ notes: true });
    const before = fakePublicApi.count(NOTES_ROUTE);
    fakeArnold.callToolsNextTurn([call]);
    await send("Note on squat: knees out");

    expect(fakePublicApi.count(NOTES_ROUTE)).toBe(before);
  });

  it("counts each result once: later turns and a reopened Conversation read nothing more", async () => {
    const view = await mount({ notes: true });
    fakeArnold.callToolsNextTurn([exerciseNoteSaved]);
    await send("Note on squat: knees out");
    const afterNote = fakePublicApi.count(NOTES_ROUTE);
    await send("Thanks");

    expect(fakePublicApi.count(NOTES_ROUTE)).toBe(afterNote);

    await view.rerender(tree({ arnold: false, notes: true }));
    await settle(queryClient);
    await view.rerender(tree({ notes: true }));

    await waitFor(() => {
      expect(screen.getAllByText(FAKE_ARNOLD_REPLY)).toHaveLength(2);
    });
    await settle(queryClient);

    expect(fakePublicApi.count(NOTES_ROUTE)).toBe(afterNote);
  });
});

describe("a note Arnold writes on a logged set", () => {
  it("reads the Workout Session and the Exercise history again, and not the notes", async () => {
    await mount({ notes: true, session: false, setNotes: true });

    expect(screen.getByText("Set notes: -, -, -")).toBeTruthy();
    expect(screen.getByText("History notes: -")).toBeTruthy();

    const notesBefore = fakePublicApi.count(NOTES_ROUTE);
    const historyBefore = fakePublicApi.count(HISTORY_ROUTE);
    const openBefore = fakePublicApi.count(OPEN_SESSION_ROUTE);
    noteSetOnServer("Felt heavy");
    fakeArnold.callToolsNextTurn([setNoteSaved]);
    await send("Note on my first squat set: felt heavy");

    expect(screen.getByText("Set notes: Felt heavy, -, -")).toBeTruthy();
    expect(screen.getByText("History notes: Felt heavy")).toBeTruthy();
    expect(fakePublicApi.count(HISTORY_ROUTE)).toBe(historyBefore + 1);
    expect(fakePublicApi.count(NOTES_ROUTE)).toBe(notesBefore);
    expect(fakePublicApi.count(OPEN_SESSION_ROUTE)).toBe(openBefore);
  });

  it.each<{ call: FakeToolCall; name: string }>([
    {
      call: {
        input: setNoteSaved.input,
        name: "set_workout_session_set_note",
        output: { error: "That set isn't logged yet, so it can't have a note" },
      },
      name: "an { error } result",
    },
    {
      call: {
        error: "The database is down",
        input: setNoteSaved.input,
        name: "set_workout_session_set_note",
      },
      name: "a failed call",
    },
  ])("reads nothing after $name", async ({ call }) => {
    await mount({ session: false, setNotes: true });
    const before = reads();
    const historyBefore = fakePublicApi.count(HISTORY_ROUTE);
    fakeArnold.callToolsNextTurn([call]);
    await send("Note on my first squat set");

    expect(reads()).toBe(before);
    expect(fakePublicApi.count(HISTORY_ROUTE)).toBe(historyBefore);
  });
});
