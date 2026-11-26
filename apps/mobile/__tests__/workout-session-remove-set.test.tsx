/**
 * Swiping an unlogged set's row left removes it from an open Workout Session
 * (FIT-808), on the Workout Session screen and the Workout Session Exercise
 * screen: a saved set through `DELETE /v1/workout-session-sets/{id}`, shown
 * gone at once and back with an alert when that fails, and an added set not
 * logged yet on the phone only.
 *
 * Mounts the real screens on the fake Public API and reads its rows
 * afterwards. The swipe itself is `test-utils/swipeable-row-stub.tsx`
 * (mocked for every test file): `set-row-<n>-open` stands for a short swipe,
 * `set-row-<n>-full-swipe` for a full one, and a row that doesn't swipe has
 * neither.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Alert } from "react-native";

import WorkoutSessionExerciseScreen from "~/app/plans/[planId]/workouts/[workoutId]/sessions/[sessionId]/exercises/[exerciseId]/index";
import WorkoutSessionScreen from "~/components/workout-sessions/workout-session-screen";
import { storage } from "~/lib/mmkv";
import { segmentClient } from "~/lib/segment";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { fakeExercise, serveExercises } from "~/test-utils/fake-exercises";
import {
  backend,
  FAKE_USER_ID,
  fakePublicApi,
} from "~/test-utils/fake-public-api";
import { InAppLanguage } from "~/test-utils/in-app-language";
import {
  createTestQueryClient,
  settle,
  until,
} from "~/test-utils/query-client";
import { resetStubRouter } from "~/test-utils/router-stub";
import { signInAs } from "~/test-utils/signed-in-user";

const mockParams: { current: Record<string, string> } = { current: {} };

jest.mock("expo-router", () => {
  const stub = jest.requireActual<typeof import("~/test-utils/router-stub")>(
    "~/test-utils/router-stub"
  );

  return {
    Stack: { Screen: stub.StackScreenStub },
    useIsFocused: () => true,
    useLocalSearchParams: () => stub.useStubParams(mockParams.current),
    useNavigation: () => ({ getState: () => ({ index: 0, routes: [{}] }) }),
    useRouter: () => ({ ...stub.stubRouter, canGoBack: () => true }),
  };
});

// The real Clerk SDK opens a MessagePort at import that keeps Jest alive.
jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: jest.requireActual<
    typeof import("~/test-utils/signed-in-user")
  >("~/test-utils/signed-in-user").getCurrentUserId,
}));

jest.mock("@sentry/react-native", () => ({ captureException: jest.fn() }));

jest.mock("~/lib/segment", () => ({
  segmentClient: { track: jest.fn() },
}));

jest.mock("react-native-reanimated", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");

  const transition = { duration: () => {} };

  return {
    __esModule: true,
    default: { View },
    FadeIn: transition,
    FadeInDown: transition,
    FadeOut: transition,
    FadeOutDown: transition,
    useReducedMotion: () => false,
  };
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock("react-native-keyboard-controller", () => {
  const { ScrollView } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return { KeyboardAwareScrollView: ScrollView };
});

jest.mock("~/components/exercises/exercise-image", () => () => null);

jest.mock("~/components/symbol-image", () => {
  const { Text } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    SymbolImage: ({ accessibilityLabel }: { accessibilityLabel?: string }) =>
      accessibilityLabel ? (
        <Text accessibilityLabel={accessibilityLabel} />
      ) : null,
  };
});

// The rest timer shows only which set it names next.
jest.mock("~/components/workout-sessions/rest-timer", () => {
  const { Text } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return ({ nextSetNumber }: { nextSetNumber: number | null }) => (
    <Text testID="rest-timer">
      {nextSetNumber === null ? "rest" : `rest then ${nextSetNumber}`}
    </Text>
  );
});

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

jest.mock("~/components/ui/dialog", () =>
  jest.requireActual("~/test-utils/dialog-stub")
);

jest.mock("~/components/ui/dropdown-menu", () => ({
  DropdownMenu: () => null,
}));

const REMOVE_ROUTE = "DELETE /v1/workout-session-sets/{id}";
const LOG_SET_ROUTE = "PATCH /v1/workout-session-sets/{id}";
const ADD_SET_ROUTE = "POST /v1/workout-session-exercises/{id}/sets";
const SESSION_ROUTE = "GET /v1/workout-sessions/{id}";
const FINISH_ROUTE = "POST /v1/workout-sessions/{id}/finish";

const REMOVE_FAILED = "Couldn't remove set";

const track = jest.mocked<
  (
    event: string,
    properties?: Record<string, string | number | boolean | null>
  ) => void
>(segmentClient.track);

// Each test mounts a whole screen and steps through many requests.
jest.setTimeout(30_000);

let queryClient: QueryClient;

const mount = async (children: ReactNode) => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <InAppLanguage>{children}</InAppLanguage>
    </QueryClientProvider>
  );
  await settle(queryClient);
};

const mountSession = () => mount(<WorkoutSessionScreen sessionId="s1" />);

const mountExercise = () => {
  mockParams.current = {
    exerciseId: "s1-e1",
    planId: "plan-1",
    sessionId: "s1",
    workoutId: "workout-1",
  };

  return mount(<WorkoutSessionExerciseScreen />);
};

const press = async (name: string) => {
  await fireEvent.press(screen.getByRole("button", { name }));
};

/** Swipes set `number` of the `exercise`th Exercise (the first by default). */
const swipeFully = async (number: number, exercise = 0) => {
  await fireEvent.press(
    screen.getAllByTestId(`set-row-${number}-full-swipe`)[exercise]
  );
};

// Hidden from VoiceOver, which gets the row's action instead.
const HIDDEN = { includeHiddenElements: true };

const removeButton = (number: number) =>
  screen.queryByTestId(`remove-set-button-${number}`, HIDDEN);

const pressRemove = async (number: number) => {
  await fireEvent.press(
    screen.getByTestId(`remove-set-button-${number}`, HIDDEN)
  );
};

const openRow = async (number: number) => {
  await fireEvent.press(screen.getByTestId(`set-row-${number}-open`));
};

const swipes = (number: number) =>
  screen.queryByTestId(`set-row-${number}-open`) !== null;

const setIds = () => backend.sets.map(({ id }) => id);

beforeEach(() => {
  backend.reset();
  storage.clearAll();
  resetStubRouter();
  jest.spyOn(Alert, "alert").mockReturnValue(undefined);
  track.mockClear();
  backend.seedProfile(FAKE_USER_ID);
  serveExercises([
    fakeExercise("squat", { muscle_groups: ["quadriceps"], name: "Squat" }),
    fakeExercise("lunge", { muscle_groups: ["quadriceps"], name: "Lunge" }),
  ]);
  backend.seed({
    exercises: [{ name: "Squat", sets: [8, null, null] }],
    id: "s1",
    workoutId: "workout-1",
  });
});

afterEach(() => {
  jest.mocked(Alert.alert).mockRestore();
});

describe.each([
  { mountScreen: mountSession, name: "the Workout Session screen" },
  { mountScreen: mountExercise, name: "the Workout Session Exercise screen" },
])("removing an unlogged set, on $name", ({ mountScreen }) => {
  it("removes a planned set with a full swipe, at once and with no alert", async () => {
    await mountScreen();
    const resume = fakePublicApi.pause(REMOVE_ROUTE);
    await swipeFully(2);

    // Gone before the API has answered, and the set after it is #2 now.
    expect(screen.queryByLabelText("Set 3 reps")).toBeNull();
    expect(screen.getByRole("button", { name: "Log set 2" })).toBeTruthy();

    resume();
    await settle(queryClient);

    expect(setIds()).toEqual(["s1-e1-s1", "s1-e1-s3"]);
    expect(fakePublicApi.count(REMOVE_ROUTE)).toBe(1);
    expect(screen.queryByLabelText("Set 3 reps")).toBeNull();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith("Set Removed", {
      exercise_id: "s1-e1",
      logged: false,
      session_id: "s1",
    });
  });

  it("shows Remove on a short swipe, which removes", async () => {
    await mountScreen();

    expect(screen.queryByText("Remove", HIDDEN)).toBeNull();

    await openRow(3);
    await pressRemove(3);
    await settle(queryClient);

    expect(setIds()).toEqual(["s1-e1-s1", "s1-e1-s2"]);
    expect(screen.queryByLabelText("Set 3 reps")).toBeNull();
  });

  it("keeps one row open at a time", async () => {
    await mountScreen();
    await openRow(2);

    expect(removeButton(2)).toBeTruthy();

    await openRow(3);

    expect(removeButton(2)).toBeNull();
    expect(removeButton(3)).toBeTruthy();
  });

  it("gives VoiceOver a Remove action on the row", async () => {
    await mountScreen();
    const number = screen.getByTestId("set-number-2");

    expect(number.props.accessibilityActions).toEqual([
      { label: "Remove set 2", name: "remove" },
    ]);

    await fireEvent(number, "accessibilityAction", {
      nativeEvent: { actionName: "remove" },
    });
    await settle(queryClient);

    expect(setIds()).toEqual(["s1-e1-s1", "s1-e1-s3"]);
  });

  it("removes a locked set, and unlocks the one the removed set held", async () => {
    await mountScreen();

    // Set 3 waits on set 2: no ✓ of its own.
    expect(screen.queryByRole("button", { name: "Log set 3" })).toBeNull();
    expect(swipes(3)).toBe(true);

    await swipeFully(2);
    await settle(queryClient);

    // The old set 3 is #2, and can be logged.
    expect(screen.getByRole("button", { name: "Log set 2" })).toBeTruthy();
    await press("Log set 2");
    await settle(queryClient);

    expect(
      backend.sets.find(({ id }) => id === "s1-e1-s3")?.reps_completed
    ).toBe(10);
  });

  it("lets a row being edited go, with its unsaved numbers", async () => {
    await mountScreen();
    await fireEvent.changeText(screen.getByLabelText("Set 2 reps"), "12");
    await swipeFully(2);
    await settle(queryClient);

    expect(setIds()).toEqual(["s1-e1-s1", "s1-e1-s3"]);
    expect(fakePublicApi.count(LOG_SET_ROUTE)).toBe(0);
    expect(screen.getByLabelText("Set 2 reps").props.value).toBe("");
  });

  it("doesn't swipe a logged set", async () => {
    await mountScreen();

    expect(screen.getByLabelText("Set 1, logged")).toBeTruthy();
    expect(swipes(1)).toBe(false);
    expect(swipes(2)).toBe(true);
  });

  it("doesn't swipe a set while its own save runs", async () => {
    await mountScreen();
    const resume = fakePublicApi.pause(LOG_SET_ROUTE);
    await press("Log set 2");
    // The save is on its way: the row stops swiping once it shows that.
    await until(() => fakePublicApi.count(LOG_SET_ROUTE) === 1 && !swipes(2));

    expect(swipes(2)).toBe(false);
    expect(swipes(3)).toBe(true);
    expect(
      screen.getByTestId("set-number-2").props.accessibilityActions
    ).toBeUndefined();

    resume();
    await settle(queryClient);
  });

  it("counts a set that's already gone as removed", async () => {
    await mountScreen();
    backend.sets = backend.sets.filter(({ id }) => id !== "s1-e1-s2");
    await swipeFully(2);
    await settle(queryClient);

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Set 3 reps")).toBeNull();
    expect(screen.getByLabelText("Set 2 reps")).toBeTruthy();
  });

  it("keeps a removed set away when a read lands before the removal's answer", async () => {
    await mountScreen();
    const resume = fakePublicApi.pause(REMOVE_ROUTE);
    await swipeFully(2);
    // Logging another set reads the Workout Session again meanwhile.
    await press("Log set 2");
    await until(() => fakePublicApi.count(LOG_SET_ROUTE) === 1);
    await act(async () => {
      await queryClient.refetchQueries();
    });

    expect(screen.queryByLabelText("Set 3 reps")).toBeNull();

    resume();
    await settle(queryClient);

    expect(setIds()).toEqual(["s1-e1-s1", "s1-e1-s3"]);
    expect(screen.queryByLabelText("Set 3 reps")).toBeNull();
  });

  it.each([
    {
      failure: { code: "rate_limited", retryAfterSeconds: 30, status: 429 },
      message: "Too many requests: please try again in 30 s.",
    },
    {
      failure: { code: "session_finished", status: 409 },
      message: "This workout is already finished.",
    },
    {
      failure: "network",
      message: "Please check your connection and try again.",
    },
  ] as const)(
    "brings the row back at its place when removing fails ($message)",
    async ({ failure, message }) => {
      await mountScreen();
      const reads = fakePublicApi.count(SESSION_ROUTE);
      fakePublicApi.failNext(REMOVE_ROUTE, failure);
      await swipeFully(2);
      await settle(queryClient);

      expect(Alert.alert).toHaveBeenCalledWith(REMOVE_FAILED, message);
      expect(setIds()).toHaveLength(3);
      expect(screen.getByRole("button", { name: "Log set 2" })).toBeTruthy();
      expect(screen.getByLabelText("Set 3 reps")).toBeTruthy();
      expect(fakePublicApi.count(SESSION_ROUTE)).toBe(reads + 1);
      expect(track).not.toHaveBeenCalledWith("Set Removed", expect.anything());
    }
  );

  it("reads the Workout Session again after a removal", async () => {
    await mountScreen();
    const reads = fakePublicApi.count(SESSION_ROUTE);
    await swipeFully(3);
    await settle(queryClient);

    expect(fakePublicApi.count(SESSION_ROUTE)).toBe(reads + 1);
  });

  it("shows and alerts nothing once the User has signed out", async () => {
    await mountScreen();
    const resume = fakePublicApi.pause(REMOVE_ROUTE);
    fakePublicApi.failNext(REMOVE_ROUTE, "network");
    await swipeFully(2);
    const reads = fakePublicApi.count(SESSION_ROUTE);
    signInAs("user_other");
    resume();
    await settle(queryClient);

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(fakePublicApi.count(SESSION_ROUTE)).toBe(reads);
  });

  it("sends no event once another User has signed in", async () => {
    await mountScreen();
    const resume = fakePublicApi.pause(REMOVE_ROUTE);
    await swipeFully(2);
    signInAs("user_other");
    resume();
    await settle(queryClient);

    expect(track).not.toHaveBeenCalledWith("Set Removed", expect.anything());
  });

  it("drops an added set on the phone only", async () => {
    await mountScreen();
    await press("Add Set");

    expect(screen.getByLabelText("Set 4 reps")).toBeTruthy();

    await swipeFully(4);
    await settle(queryClient);

    expect(screen.queryByLabelText("Set 4 reps")).toBeNull();
    expect(fakePublicApi.count(REMOVE_ROUTE)).toBe(0);
    expect(track).not.toHaveBeenCalledWith("Set Removed", expect.anything());
  });

  it("gives a set added after a removed one its own row", async () => {
    await mountScreen();
    await press("Add Set");
    await press("Add Set");
    await swipeFully(4);
    await press("Add Set");

    expect(screen.getByLabelText("Set 4 reps")).toBeTruthy();
    expect(screen.getByLabelText("Set 5 reps")).toBeTruthy();
    expect(screen.queryByLabelText("Set 6 reps")).toBeNull();

    // Each logs as its own set.
    await fireEvent.changeText(screen.getByLabelText("Set 2 reps"), "8");
    await press("Log set 2");
    await settle(queryClient);
    await press("Log set 3");
    await settle(queryClient);
    await press("Log set 4");
    await settle(queryClient);
    await press("Log set 5");
    await settle(queryClient);

    expect(fakePublicApi.count(ADD_SET_ROUTE)).toBe(2);
    expect(backend.sets).toHaveLength(5);
    expect(new Set(backend.sets.map(({ order }) => order)).size).toBe(5);
  });

  it("keeps the row of a set added while a removal fails apart from it", async () => {
    await mountScreen();
    const resume = fakePublicApi.pause(REMOVE_ROUTE);
    fakePublicApi.failNext(REMOVE_ROUTE, "network");
    await swipeFully(3);
    await press("Add Set");
    resume();
    await settle(queryClient);

    expect(screen.getByLabelText("Set 3 reps")).toBeTruthy();
    expect(screen.getByLabelText("Set 4 reps")).toBeTruthy();
    expect(screen.queryByLabelText("Set 5 reps")).toBeNull();
  });

  it("removes the last set, leaving the Exercise with Add Set from 0×0", async () => {
    backend.sets = backend.sets.filter(({ id }) => id === "s1-e1-s2");
    await mountScreen();
    await swipeFully(1);
    await settle(queryClient);

    expect(backend.sets).toEqual([]);
    expect(screen.queryByLabelText("Set 1 reps")).toBeNull();

    await press("Add Set");

    expect(screen.getByLabelText("Set 1 reps").props.placeholder).toBe("0");
    expect(screen.getByLabelText("Set 1 weight").props.placeholder).toBe("0");
  });

  it("removes in Ukrainian too", async () => {
    setDeviceLanguages(["uk-UA"]);
    await mountScreen();
    const number = screen.getByTestId("set-number-2");

    expect(number.props.accessibilityActions).toEqual([
      { label: "Видалити підхід 2", name: "remove" },
    ]);

    fakePublicApi.failNext(REMOVE_ROUTE, "network");
    await openRow(2);

    expect(screen.getByText("Видалити", HIDDEN)).toBeTruthy();

    await pressRemove(2);
    await settle(queryClient);

    expect(Alert.alert).toHaveBeenCalledWith(
      "Не вдалося видалити підхід",
      "Перевірте з’єднання і спробуйте ще раз."
    );

    await swipeFully(2);
    await settle(queryClient);

    expect(screen.queryByLabelText("Підхід 3, повторення")).toBeNull();
  });
});

describe("removing a set in a finished Workout Session", () => {
  it.each([
    { mountScreen: mountSession, name: "the Workout Session screen" },
    { mountScreen: mountExercise, name: "the Workout Session Exercise screen" },
  ])("doesn't swipe on $name", async ({ mountScreen }) => {
    backend.reset();
    backend.seedProfile(FAKE_USER_ID);
    backend.seed({
      exercises: [{ name: "Squat", sets: [8, null] }],
      finished: true,
      id: "s1",
      workoutId: "workout-1",
    });
    await mountScreen();

    expect(screen.queryByTestId("set-row-1-open")).toBeNull();
    expect(screen.queryByTestId("set-row-2-open")).toBeNull();
  });
});

describe("the rest timer after a removal", () => {
  it("keeps running and names the next unlogged set by its new number", async () => {
    backend.sets = backend.sets.map((set) => ({
      ...set,
      rest_recommended: 60,
    }));
    backend.sets.push({
      ...backend.sets[2],
      id: "s1-e1-s4",
      order: 4,
    });
    await mountExercise();
    await press("Log set 2");
    await settle(queryClient);

    expect(screen.getByTestId("rest-timer").props.children).toBe("rest then 3");

    await swipeFully(3);
    await settle(queryClient);

    expect(screen.getByTestId("rest-timer").props.children).toBe("rest then 3");

    await swipeFully(3);
    await settle(queryClient);

    expect(screen.getByTestId("rest-timer").props.children).toBe("rest");
  });
});

describe("finishing after a removal", () => {
  const isSuggestionShown = () =>
    screen.queryByTestId("finish-workout-suggestion-keep-training") !== null;

  it("never suggests finishing when the removed set was the last unlogged one", async () => {
    backend.sets = backend.sets.filter(({ id }) => id !== "s1-e1-s3");
    await mountExercise();
    await swipeFully(2);
    await settle(queryClient);

    expect(isSuggestionShown()).toBe(false);
  });

  it("doesn't suggest finishing while an emptied Exercise is in the Workout Session", async () => {
    backend.reset();
    backend.seedProfile(FAKE_USER_ID);
    backend.seed({
      exercises: [
        { name: "Squat", sets: [null] },
        { name: "Lunge", sets: [null] },
      ],
      id: "s1",
      workoutId: "workout-1",
    });
    await mountSession();
    await swipeFully(1);
    await settle(queryClient);
    await press("Log set 1");
    await settle(queryClient);

    expect(backend.sets).toHaveLength(1);
    expect(backend.sets[0]?.reps_completed).toBe(10);
    expect(isSuggestionShown()).toBe(false);

    await press("Finish");
    await settle(queryClient);

    expect(fakePublicApi.count(FINISH_ROUTE)).toBe(1);
  });
});
