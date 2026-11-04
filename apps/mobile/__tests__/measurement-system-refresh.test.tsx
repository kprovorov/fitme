/**
 * Switching the measurement system refreshes every weight on screen
 * (FIT-539): the measurement system screen, History and a Workout screen
 * mounted together on one query cache, so a switch has to re-read both the
 * Public API's History and the Plan's planned sets. Supabase is the in-memory
 * backend and the Public API client's `fetch` the fake over the same rows
 * (both from `test-utils/`), which converts them as the API does.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { type ReactNode, useCallback } from "react";
import { Alert, Pressable } from "react-native";
import HistoryScreen from "~/app/(tabs)/history/index";
import WorkoutScreen from "~/app/plans/[planId]/workouts/[workoutId]/index";
import MeasurementSystemScreen from "~/app/settings/measurement-system";
import {
  FAKE_USER_ID,
  type Failure,
  fakePublicApi,
} from "~/test-utils/fake-public-api";
import { backend, type SeedPlan } from "~/test-utils/fake-workout-backend";
import {
  createTestQueryClient,
  settle,
  until,
} from "~/test-utils/query-client";
import { signInAs } from "~/test-utils/signed-in-user";

jest.mock("expo-router", () => ({
  Link: ({ children }: { children: ReactNode }) => children,
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ planId: "plan-1", workoutId: "workout-1" }),
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: () => true,
    navigate: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

// LegendList lays its items out on measure, which Jest never does: render
// the header and every item in a plain view instead.
jest.mock("@legendapp/list/react-native", () => ({
  LegendList: <T,>({
    data,
    keyExtractor,
    ListEmptyComponent,
    ListHeaderComponent,
    renderItem,
  }: {
    data: T[];
    keyExtractor: (item: T) => string;
    ListEmptyComponent: ReactNode;
    ListHeaderComponent: ReactNode;
    renderItem: (info: { item: T }) => ReactNode;
  }) => {
    const { Fragment } = jest.requireActual<typeof import("react")>("react");
    return (
      <>
        {ListHeaderComponent}
        {data.length === 0
          ? ListEmptyComponent
          : data.map((item) => (
              <Fragment key={keyExtractor(item)}>
                {renderItem({ item })}
              </Fragment>
            ))}
      </>
    );
  },
}));

jest.mock("~/lib/supabase", () => ({
  supabase: jest.requireActual<
    typeof import("~/test-utils/fake-workout-backend")
  >("~/test-utils/fake-workout-backend").fakeSupabase,
}));

// The real Clerk SDK (reached through the Supabase reads) opens a MessagePort
// at import that keeps Jest alive.
jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: jest.requireActual<
    typeof import("~/test-utils/signed-in-user")
  >("~/test-utils/signed-in-user").getCurrentUserId,
}));

jest.mock("@sentry/react-native", () => ({ captureException: jest.fn() }));
jest.mock("~/lib/segment", () => ({ segmentClient: { track: jest.fn() } }));
jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: { invalidateCustomerInfoCache: jest.fn() },
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));
jest.mock("~/components/exercises/exercise-image", () => () => null);
jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);
// Buttons of the stand-ins below. Top-level (and `mock`-prefixed, so the
// factories may use them) because the React Compiler rewrites components
// declared inside a `jest.mock` factory into code the factory can't reach.
const MockOption = ({
  onValueChange,
  value,
}: {
  onValueChange: (value: string) => void;
  value: string;
}) => {
  const handlePress = useCallback(
    () => onValueChange(value),
    [onValueChange, value]
  );
  return <Pressable onPress={handlePress} testID={`option-${value}`} />;
};

// Like the native alert: any button runs its action, then closes.
const MockAction = ({
  label,
  onIsPresentedChange,
  onPress,
}: {
  label: string;
  onIsPresentedChange: (isPresented: boolean) => void;
  onPress?: () => void;
}) => {
  const handlePress = useCallback(() => {
    onPress?.();
    onIsPresentedChange(false);
  }, [onIsPresentedChange, onPress]);
  return <Pressable onPress={handlePress} testID={`dialog-${label}`} />;
};

// The real primitives render native SwiftUI views that can't mount under
// Jest. The picker stand-in exposes the `value` it's given, which is what the
// native picker shows.
jest.mock("~/components/ui/radio-group", () => {
  const { Text: MockText, View: MockView } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    RadioGroup: ({
      onValueChange,
      options,
      value,
    }: {
      onValueChange: (value: string) => void;
      options: { label: string; value: string }[];
      value: string;
    }) => (
      <MockView>
        <MockText testID="picker-value">{value}</MockText>
        {options.map((option) => (
          <MockOption
            key={option.value}
            onValueChange={onValueChange}
            value={option.value}
          />
        ))}
      </MockView>
    ),
  };
});
jest.mock("~/components/ui/alert-dialog", () => {
  const { View: MockView } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    AlertDialog: ({
      actions,
      isPresented,
      onIsPresentedChange,
    }: {
      actions: { label: string; onPress?: () => void }[];
      isPresented: boolean;
      onIsPresentedChange: (isPresented: boolean) => void;
    }) =>
      isPresented ? (
        <MockView>
          {actions.map((action) => (
            <MockAction
              key={action.label}
              label={action.label}
              onIsPresentedChange={onIsPresentedChange}
              onPress={action.onPress}
            />
          ))}
        </MockView>
      ) : null,
  };
});

const PROFILE_PATCH = "PATCH /v1/profile";
/** History's volume once converted to pounds. */
const CONVERTED_VOLUME = /440\.92/;
const MINUTE_MS = 60_000;

/** A Plan whose Leg Day has one 5 × 100 kg set. */
const PLAN: SeedPlan = {
  id: "plan-1",
  is_active: true,
  name: "Strength",
  workouts: [
    {
      exercises: [
        {
          sets: [
            {
              reps_recommended: 5,
              rest_recommended: 180,
              weight_recommended: 100,
            },
          ],
          slug: "barbell-back-squat",
        },
      ],
      id: "workout-1",
      name: "Leg Day",
    },
  ],
};

/** A finished Workout Session of this month: 30 min, one 4 × 50 kg set. */
const seedFinishedSession = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 2, 9, 0);
  backend.sessions.push({
    finished_at: new Date(start.getTime() + 30 * MINUTE_MS).toISOString(),
    id: "session-1",
    plan_id: "plan-1",
    started_at: start.toISOString(),
    workout_id: "workout-1",
    workoutName: "Leg Day",
  });
  backend.exercises.push({
    exercise_slug: "barbell-back-squat",
    id: "session-1-e1",
    order: 1,
    workout_session_id: "session-1",
  });
  backend.sets.push({
    id: "session-1-e1-s1",
    logged_at: start.toISOString(),
    order: 1,
    reps_completed: 4,
    reps_recommended: 4,
    rest_recommended: null,
    weight_completed: 50,
    weight_recommended: 50,
    workout_session_exercise_id: "session-1-e1",
  });
};

let queryClient = createTestQueryClient();

const mount = async () => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <MeasurementSystemScreen />
      <HistoryScreen />
      <WorkoutScreen />
    </QueryClientProvider>
  );
  await settle(queryClient);
};

/** Picks `system`, confirms it, then waits for the switch to settle. */
const switchTo = async (system: string) => {
  await fireEvent.press(screen.getByTestId(`option-${system}`));
  await fireEvent.press(screen.getByTestId("dialog-Confirm"));
  await settle(queryClient);
};

/** The History row's duration, set count and volume. */
const historyRow = (volume: string) =>
  screen.getByText(`30min · 1 set · ${volume}`);

/** Presses the Profile's Try Again, then waits for the read to settle. */
const retryProfileRead = async () => {
  await fireEvent.press(screen.getByRole("button", { name: "Try Again" }));
  await settle(queryClient);
};

/** The planned set, as VoiceOver reads it on the Workout screen. */
const plannedSet = (weight: string) =>
  screen.getByLabelText(`Set 1: 5 reps at ${weight}, rest 180 seconds`);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  backend.reset();
  backend.seedProfile(FAKE_USER_ID, { height: 180, weight: 80 });
  backend.seedPlan(structuredClone(PLAN));
  seedFinishedSession();
});

describe("Switching the measurement system", () => {
  it("refreshes History and the Workout's planned weights, with no restart", async () => {
    await mount();
    expect(historyRow("200 kg")).toBeTruthy();
    expect(plannedSet("100 kg")).toBeTruthy();

    await switchTo("us");

    expect(screen.getByTestId("picker-value")).toHaveTextContent("us");
    // 50 kg is 110.23 lbs a set, so 440.92 lbs of volume, and the planned
    // 100 kg is 220.46 lbs.
    expect(historyRow("440.92 lbs")).toBeTruthy();
    expect(plannedSet("220.46 lbs")).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("refreshes them again on the way back to metric", async () => {
    await mount();

    await switchTo("us");
    expect(historyRow("440.92 lbs")).toBeTruthy();

    await switchTo("metric");

    expect(screen.getByTestId("picker-value")).toHaveTextContent("metric");
    expect(historyRow("200 kg")).toBeTruthy();
    expect(plannedSet("100 kg")).toBeTruthy();
  });

  it.each([
    [
      "a 5xx",
      { status: 503 },
      "Your measurements weren't changed. Please try again.",
    ],
    [
      "too many requests",
      { retryAfterSeconds: 42, status: 429 },
      "Your measurements weren't changed. Too many requests: please try again in 42 s.",
    ],
  ] as [string, Failure, string][])(
    "keeps every cached number on %s",
    async (_name, failure, message) => {
      await mount();
      const reads = fakePublicApi.count("GET /v1/workout-sessions");
      fakePublicApi.failNext(PROFILE_PATCH, failure);

      await switchTo("us");

      expect(Alert.alert).toHaveBeenCalledWith(
        "Couldn't Change Units",
        message
      );
      // Nothing was converted, so nothing is re-read.
      expect(fakePublicApi.count("GET /v1/workout-sessions")).toBe(reads);
      expect(historyRow("200 kg")).toBeTruthy();
      expect(plannedSet("100 kg")).toBeTruthy();
    }
  );

  it("leaves them alone when the answer is lost and the saved system can't be read back", async () => {
    await mount();
    fakePublicApi.failNext(PROFILE_PATCH, "lost");
    // Offline: the read after the switch fails, and so does the one the
    // dropped Profile starts. Without it there is no unit to show a
    // converted number in, so nothing is read again.
    fakePublicApi.failNext("GET /v1/profile", "network");
    fakePublicApi.failNext("GET /v1/profile", "network");

    await switchTo("us");

    expect(Alert.alert).toHaveBeenCalledWith(
      "Couldn't Check Your Units",
      expect.any(String)
    );
    expect(screen.queryByTestId("picker-value")).toBeNull();
    expect(historyRow("200 kg")).toBeTruthy();
    expect(plannedSet("100 kg")).toBeTruthy();
  });

  it("leaves them alone when a newer Profile superseded the answer and can't be read back", async () => {
    await mount();
    const resumeSwitch = fakePublicApi.pause(PROFILE_PATCH);
    await fireEvent.press(screen.getByTestId("option-us"));
    await fireEvent.press(screen.getByTestId("dialog-Confirm"));
    await until(() => fakePublicApi.count(PROFILE_PATCH) === 1);
    // A refresh of the Profile lands while the switch waits for its answer,
    // so the answer can't be shown as is; then every read of it is refused.
    const profile = backend.profile(FAKE_USER_ID);
    if (profile) {
      // Another device changed the age.
      profile.age = 41;
    }
    await act(() => queryClient.refetchQueries({ queryKey: ["profile"] }));
    for (let read = 0; read < 4; read += 1) {
      fakePublicApi.failNext("GET /v1/profile", {
        retryAfterSeconds: 42,
        status: 429,
      });
    }
    const weighedReads = fakePublicApi.count("GET /v1/workout-sessions");

    resumeSwitch();
    await settle(queryClient);

    // The saved system can't be confirmed, so nothing is read again into
    // units the Screens couldn't name.
    expect(Alert.alert).toHaveBeenCalledWith(
      "Couldn't Check Your Units",
      expect.any(String)
    );
    expect(fakePublicApi.count("GET /v1/workout-sessions")).toBe(weighedReads);
    expect(historyRow("200 kg")).toBeTruthy();
    expect(plannedSet("100 kg")).toBeTruthy();
    expect(screen.queryByText(CONVERTED_VOLUME)).toBeNull();
  });

  it("refreshes them from the Profile read again when a newer one superseded the answer", async () => {
    await mount();
    const resumeSwitch = fakePublicApi.pause(PROFILE_PATCH);
    await fireEvent.press(screen.getByTestId("option-us"));
    await fireEvent.press(screen.getByTestId("dialog-Confirm"));
    await until(() => fakePublicApi.count(PROFILE_PATCH) === 1);
    // A refresh of the Profile lands while the switch waits for its answer,
    // so the answer can't be shown as is and the Profile is read again. That
    // read succeeds; any further one would be refused.
    const profile = backend.profile(FAKE_USER_ID);
    if (profile) {
      // Another device changed the age.
      profile.age = 41;
    }
    await act(() => queryClient.refetchQueries({ queryKey: ["profile"] }));
    fakePublicApi.failNext("GET /v1/profile", "pass");
    fakePublicApi.failNext("GET /v1/profile", {
      retryAfterSeconds: 42,
      status: 429,
    });

    resumeSwitch();
    await settle(queryClient);

    // The read confirmed the switch: no further read, no alert, and every
    // weight is read again in pounds.
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(historyRow("440.92 lbs")).toBeTruthy();
    expect(plannedSet("220.46 lbs")).toBeTruthy();
  });

  describe("whose answer couldn't be checked", () => {
    const RATE_LIMITED: Failure = { retryAfterSeconds: 42, status: 429 };

    /**
     * Switches to pounds with the answer lost and both reads of the Profile
     * refused, so the saved system can't be checked and the Profile is
     * dropped. `landed` says whether the conversion committed server-side.
     */
    const switchUnchecked = async ({ landed }: { landed: boolean }) => {
      await mount();
      // A lost answer hides a conversion that committed; a 503 changes
      // nothing.
      fakePublicApi.failNext(PROFILE_PATCH, landed ? "lost" : { status: 503 });
      // The read after the switch, then the one the dropped Profile starts.
      fakePublicApi.failNext("GET /v1/profile", RATE_LIMITED);
      fakePublicApi.failNext("GET /v1/profile", RATE_LIMITED);

      await switchTo("us");

      expect(Alert.alert).toHaveBeenCalledWith(
        "Couldn't Check Your Units",
        expect.any(String)
      );
      expect(historyRow("200 kg")).toBeTruthy();
      expect(plannedSet("100 kg")).toBeTruthy();
    };

    it("refreshes them once a later Profile read confirms the new system", async () => {
      await switchUnchecked({ landed: true });

      await retryProfileRead();

      // The Profile now says pounds, so every weight is read again in them.
      expect(screen.getByTestId("picker-value")).toHaveTextContent("us");
      expect(historyRow("440.92 lbs")).toBeTruthy();
      expect(plannedSet("220.46 lbs")).toBeTruthy();
    });

    it("refreshes them only once, however often the Profile is read", async () => {
      await switchUnchecked({ landed: true });

      await retryProfileRead();
      const weighedReads = fakePublicApi.count("GET /v1/workout-sessions");
      await act(() => queryClient.refetchQueries({ queryKey: ["profile"] }));
      await settle(queryClient);

      expect(fakePublicApi.count("GET /v1/workout-sessions")).toBe(
        weighedReads
      );
    });

    it("refreshes nothing when a later Profile read shows the old system", async () => {
      await switchUnchecked({ landed: false });
      const weighedReads = fakePublicApi.count("GET /v1/workout-sessions");

      await retryProfileRead();

      // The switch never landed, so nothing was converted to read again.
      expect(screen.getByTestId("picker-value")).toHaveTextContent("metric");
      expect(fakePublicApi.count("GET /v1/workout-sessions")).toBe(
        weighedReads
      );
      expect(historyRow("200 kg")).toBeTruthy();
      expect(plannedSet("100 kg")).toBeTruthy();
    });

    it("refreshes nothing for another User signed in since", async () => {
      await switchUnchecked({ landed: true });
      const weighedReads = fakePublicApi.count("GET /v1/workout-sessions");
      signInAs("user_someone_else");

      await retryProfileRead();

      // Nothing cached is theirs to re-read.
      expect(fakePublicApi.count("GET /v1/workout-sessions")).toBe(
        weighedReads
      );
      expect(historyRow("200 kg")).toBeTruthy();
    });
  });

  it("refreshes them when the answer is lost but the switch went through", async () => {
    await mount();
    fakePublicApi.failNext(PROFILE_PATCH, "lost");

    await switchTo("us");

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(historyRow("440.92 lbs")).toBeTruthy();
    expect(plannedSet("220.46 lbs")).toBeTruthy();
  });
});
