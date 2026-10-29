/**
 * Logging a set in the App language (FIT-400): in Ukrainian, the Workout
 * Session Exercise screen's sets table (headings, targets with their unit),
 * the set form's bounds messages, a failed set save and the rest timer read
 * in Ukrainian.
 *
 * Mounts the real Exercise screen on the in-memory Supabase backend and the
 * fake Public API, under the root layout's language sync; the device language
 * comes from the mocked `expo-localization` (`test-utils/device-locales.ts`).
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { AccessibilityInfo, Alert } from "react-native";
import PlanSessionExerciseScreen from "~/app/plans/[planId]/workouts/[workoutId]/sessions/[sessionId]/exercises/[exerciseId]/index";
import { i18n, useAppLanguageSync } from "~/lib/i18n";
import { storage } from "~/lib/mmkv";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { serveLibrary } from "~/test-utils/fake-library";
import { fakePublicApi } from "~/test-utils/fake-public-api";
import {
  backend,
  libraryExerciseNamed,
} from "~/test-utils/fake-workout-backend";
import {
  createTestQueryClient,
  settle as settleQueries,
} from "~/test-utils/query-client";

jest.mock("expo-router", () => ({
  Link: ({ children }: { children: ReactNode }) => children,
  Stack: { Screen: () => null },
  useIsFocused: () => true,
  useLocalSearchParams: () => ({
    exerciseId: "s1-e1",
    planId: "plan-1",
    sessionId: "s1",
    workoutId: "workout-of-s1",
  }),
  useNavigation: () => ({ getState: () => ({ index: 0, routes: [{}] }) }),
  useRouter: () => ({
    dismiss: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock("~/lib/supabase", () => ({
  supabase: jest.requireActual<
    typeof import("~/test-utils/fake-workout-backend")
  >("~/test-utils/fake-workout-backend").fakeSupabase,
}));
jest.mock(
  "~/lib/library",
  () =>
    jest.requireActual<typeof import("~/test-utils/fake-library")>(
      "~/test-utils/fake-library"
    ).libraryModule
);
jest.mock("~/hooks/queries/profiles", () => ({
  useProfileQuery: () => ({ data: { measurement_system: "metric" } }),
}));
jest.mock("@sentry/react-native", () => ({ captureException: jest.fn() }));
jest.mock("~/lib/segment", () => ({ segmentClient: { track: jest.fn() } }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));
jest.mock("react-native-keyboard-controller", () => {
  const { ScrollView } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return { KeyboardAwareScrollView: ScrollView };
});
// Reanimated can't load under Jest: the rest timer's view is a plain View,
// its transitions no-ops.
jest.mock("react-native-reanimated", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const transition = { duration: () => undefined };
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
jest.mock("~/components/exercises/exercise-image", () => () => null);
jest.mock("~/components/exercises/exercise-video", () => () => null);
jest.mock("~/components/views/exercise-history-view", () => () => null);
jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);
jest.mock("~/components/ui/dialog", () =>
  jest.requireActual("~/test-utils/dialog-stub")
);

const ADD_SET = "POST /v1/workout-session-exercises/{id}/sets";
const LOG_SET = "PATCH /v1/workout-session-sets/{id}";

let queryClient: QueryClient;

function InAppLanguage({ children }: { children: ReactNode }) {
  useAppLanguageSync();
  return children;
}

/** Waits until every request, query and mutation is done. */
const settle = () => settleQueries(queryClient, () => backend.inFlight === 0);

/**
 * Opens the Squat of Workout Session `s1`: set 1 of 12×45 kg with 90 s of
 * rest, set 2 of 10 reps with no target weight.
 */
const openExercise = async () => {
  backend.seed({
    exercises: [{ name: "Squat", sets: [null, null] }],
    id: "s1",
  });
  Object.assign(backend.sets[0] ?? {}, {
    reps_recommended: 12,
    rest_recommended: 90,
    weight_recommended: 45,
  });
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <InAppLanguage>
        <PlanSessionExerciseScreen />
      </InAppLanguage>
    </QueryClientProvider>
  );
  await settle();
};

const logSet = async (order: number, reps?: string) => {
  if (reps !== undefined) {
    await fireEvent.changeText(
      screen.getByTestId(`set-reps-input-${order}`),
      reps
    );
  }
  await fireEvent.press(screen.getByTestId(`log-set-button-${order}`));
  await settle();
};

jest.setTimeout(30_000);

beforeEach(() => {
  jest.clearAllMocks();
  backend.reset();
  storage.clearAll();
  serveLibrary([libraryExerciseNamed("Squat")]);
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  jest
    .spyOn(AccessibilityInfo, "announceForAccessibility")
    .mockImplementation(() => undefined);
  setDeviceLanguages(["uk-UA"]);
});

// The i18n instance outlives a test; the device goes back to English on its own.
afterEach(async () => {
  await i18n.changeLanguage("en");
  expect(backend.unsupported).toEqual([]);
});

describe("the sets table in Ukrainian", () => {
  it("heads its columns and writes each target with its unit", async () => {
    await openExercise();

    // The headings are hidden from VoiceOver, which reads each row instead.
    const hidden = { includeHiddenElements: true };
    expect(screen.getByText("ціль", hidden)).toBeTruthy();
    expect(screen.getByText("повтори", hidden)).toBeTruthy();
    expect(screen.getByText("кг", hidden)).toBeTruthy();
    expect(screen.getByText("12×45кг")).toBeTruthy();
    expect(screen.getByText("10")).toBeTruthy();
    expect(screen.getByLabelText("Підхід 1, вага")).toBeTruthy();
    expect(screen.getByLabelText("Записати підхід 1")).toBeTruthy();
  });

  it("refuses a value out of bounds with a Ukrainian message", async () => {
    await openExercise();

    await fireEvent.changeText(screen.getByTestId("set-weight-input-1"), "-5");
    await logSet(1, "1001");

    expect(
      screen.getByText("Кількість повторень має бути не більше 1000")
    ).toBeTruthy();
    expect(screen.getByText("Вага не може бути від’ємною")).toBeTruthy();
    expect(fakePublicApi.count(LOG_SET)).toBe(0);
  });

  it("says a set couldn't be added, and how long to wait when rate limited", async () => {
    await openExercise();
    await logSet(1);
    await logSet(2);
    await fireEvent.press(screen.getByText("Додати підхід"));

    fakePublicApi.failNext(ADD_SET, { status: 500 });
    await logSet(3, "6");
    expect(
      screen.getByText("Не вдалося зберегти підхід. Спробуйте ще раз.")
    ).toBeTruthy();

    fakePublicApi.failNext(ADD_SET, { retryAfterSeconds: 7, status: 429 });
    await logSet(3, "6");
    expect(
      screen.getByText("Забагато запитів. Спробуйте ще раз через 7 с.")
    ).toBeTruthy();
  });
});

describe("the rest timer in Ukrainian", () => {
  it("counts down the rest before the next set", async () => {
    await openExercise();

    await logSet(1);

    expect(screen.getByText("Відпочинок · далі підхід 2")).toBeTruthy();
    expect(screen.getByLabelText("Відпочинок, залишилося 1:30")).toBeTruthy();
    expect(screen.getByLabelText("На 15 секунд більше")).toBeTruthy();
    expect(screen.getByText("Пропустити")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Пропустити відпочинок"));
    await act(() => undefined);
    expect(screen.queryByText("Відпочинок · далі підхід 2")).toBeNull();
  });
});
