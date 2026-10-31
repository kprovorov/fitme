/**
 * An open Workout Session's screen in the App language (FIT-399): in
 * Ukrainian, its header, stats and Exercise cards read in Ukrainian, and so do
 * adding, replacing and removing an Exercise and each of their failure
 * alerts.
 *
 * Mounts the real screen on the in-memory Supabase backend and the fake
 * Public API, under the root layout's language sync; the device language
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
import { Alert } from "react-native";
import HistorySessionScreen from "~/app/workout-sessions/[workoutSessionId]";
import ExercisePickerScreen from "~/app/workout-sessions/[workoutSessionId]/exercise-picker";
import { i18n } from "~/lib/i18n";
import { storage } from "~/lib/mmkv";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { libraryExercise, serveLibrary } from "~/test-utils/fake-library";
import { type Failure, fakePublicApi } from "~/test-utils/fake-public-api";
import { backend } from "~/test-utils/fake-workout-backend";
import { InAppLanguage } from "~/test-utils/in-app-language";
import {
  createTestQueryClient,
  settle as settleQueries,
} from "~/test-utils/query-client";
import { PushedRoutes, resetStubRouter } from "~/test-utils/router-stub";

jest.mock("expo-router", () => {
  const stub = jest.requireActual<typeof import("~/test-utils/router-stub")>(
    "~/test-utils/router-stub"
  );
  return {
    Link: ({ children }: { children: unknown }) => children,
    Stack: { Screen: stub.StackScreenStub },
    useIsFocused: () => true,
    useLocalSearchParams: () => stub.useStubParams({ workoutSessionId: "s1" }),
    useNavigation: () => ({ getState: () => ({ index: 0, routes: [{}] }) }),
    useRouter: () => stub.stubRouter,
  };
});

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
jest.mock("~/components/exercises/exercise-image", () => () => null);
jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));
jest.mock("~/components/workout-sessions/rest-timer", () => () => null);
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);
jest.mock("~/components/ui/dialog", () =>
  jest.requireActual("~/test-utils/dialog-stub")
);
// The card's menu shows each item as a button named by its label.
jest.mock("~/components/ui/dropdown-menu", () => {
  const { Pressable } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    DropdownMenu: ({
      accessibilityLabel,
      items,
    }: {
      accessibilityLabel: string;
      items: Array<{ label: string; onPress?: () => void }>;
    }) =>
      items.map((item) => (
        <Pressable
          accessibilityHint={accessibilityLabel}
          accessibilityLabel={item.label}
          accessibilityRole="menuitem"
          key={item.label}
          onPress={item.onPress}
        />
      )),
  };
});
// The Exercise picker's muscle group menu (SwiftUI) shows nothing.
jest.mock("~/components/ui/picker", () => ({ Picker: () => null }));

const ADD_EXERCISE = "POST /v1/workout-sessions/{id}/exercises";
const REMOVE_EXERCISE = "DELETE /v1/workout-session-exercises/{id}";
const REPLACE_EXERCISE = "PUT /v1/workout-session-exercises/{id}";

/** Each failure the alerts name, and the Ukrainian message for it. */
const failures: [Failure, string][] = [
  [
    { code: "library_unavailable", status: 503 },
    "Бібліотека вправ зараз недоступна. Спробуйте ще раз.",
  ],
  [{ code: "session_finished", status: 409 }, "Це тренування вже завершено."],
  [
    { retryAfterSeconds: 12, status: 429 },
    "Забагато запитів: спробуйте ще раз через 12 с.",
  ],
  [{ status: 500 }, "Перевірте з’єднання і спробуйте ще раз."],
];

let queryClient: QueryClient;

/** Waits until every request, query and mutation is done. */
const settle = () => settleQueries(queryClient, () => backend.inFlight === 0);

const renderSession = async () => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <InAppLanguage>
        <HistorySessionScreen />
        <PushedRoutes
          screens={{
            "/workout-sessions/[workoutSessionId]/exercise-picker":
              ExercisePickerScreen,
          }}
        />
      </InAppLanguage>
    </QueryClientProvider>
  );
  await settle();
};

/** Presses `element`, waiting for the save it starts and its alert. */
const pressAndSettle = async (
  element: Parameters<typeof fireEvent.press>[0]
) => {
  await act(async () => {
    await fireEvent.press(element);
  });
  await settle();
};

const firstOf = async (find: Promise<unknown[]>) => {
  const [first] = await find;
  return first as Parameters<typeof fireEvent.press>[0];
};

jest.setTimeout(30_000);

beforeEach(() => {
  jest.clearAllMocks();
  resetStubRouter();
  backend.reset();
  storage.clearAll();
  serveLibrary([
    libraryExercise("squat", {
      translations: { uk: { name: "Присідання" } },
    }),
    libraryExercise("lunge", { translations: { uk: { name: "Випади" } } }),
  ]);
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  // Squat: one set of 10 logged at 62.5 kg, one to go; Lunge: not started.
  backend.seed({
    exercises: [
      { name: "Squat", sets: [10, null] },
      { name: "Lunge", sets: [null] },
    ],
    id: "s1",
  });
  Object.assign(backend.sets[0] ?? {}, { weight_completed: 62.5 });
  setDeviceLanguages(["uk-UA"]);
});

// The i18n instance outlives a test; the device goes back to English on its own.
afterEach(async () => {
  await i18n.changeLanguage("en");
  expect(backend.unsupported).toEqual([]);
});

describe("an open Workout Session in Ukrainian", () => {
  it("reads its header, stats and Exercise cards in Ukrainian", async () => {
    await renderSession();

    expect(screen.getByText("Workout s1")).toBeTruthy();
    expect(screen.getByText("Завершити")).toBeTruthy();
    expect(screen.getByText("Тривалість")).toBeTruthy();
    expect(screen.getByText("Обсяг")).toBeTruthy();
    expect(screen.getByText("625 кг")).toBeTruthy();
    expect(screen.getByText("Підходи")).toBeTruthy();
    expect(screen.getByText("1/3")).toBeTruthy();
    expect(screen.getByText("Виконано 0 з 2 вправ")).toBeTruthy();

    expect(await screen.findByText("Присідання")).toBeTruthy();
    expect(await screen.findByText("Випади")).toBeTruthy();
    expect(screen.getAllByLabelText("Замінити")).toHaveLength(2);
    expect(screen.getAllByLabelText("Видалити")).toHaveLength(2);
    expect(screen.getAllByHintText("Інші дії для «Присідання»")).toHaveLength(
      2
    );
    expect(screen.getByText("Додати вправу")).toBeTruthy();
  });

  it.each(failures)(
    "says why removing, replacing or adding an Exercise failed (%j)",
    async (failure, message) => {
      await renderSession();

      fakePublicApi.failNext(REMOVE_EXERCISE, failure);
      await pressAndSettle(
        await firstOf(screen.findAllByLabelText("Видалити"))
      );
      expect(Alert.alert).toHaveBeenLastCalledWith(
        "Не вдалося видалити вправу",
        message
      );

      await fireEvent.press(
        await firstOf(screen.findAllByLabelText("Замінити"))
      );
      fakePublicApi.failNext(REPLACE_EXERCISE, failure);
      await pressAndSettle(
        await screen.findByRole("button", { name: "Замінити на Випади" })
      );
      expect(Alert.alert).toHaveBeenLastCalledWith(
        "Не вдалося замінити вправу",
        message
      );
      // The picker stays open after a failure, so the User can try again.
      await fireEvent.press(screen.getByLabelText("Закрити"));

      await fireEvent.press(
        screen.getByRole("button", { name: "Додати вправу" })
      );
      fakePublicApi.failNext(ADD_EXERCISE, failure);
      await pressAndSettle(
        await screen.findByRole("button", { name: "Додати Випади" })
      );
      expect(Alert.alert).toHaveBeenLastCalledWith(
        "Не вдалося додати вправу",
        message
      );

      expect(fakePublicApi.count(REMOVE_EXERCISE)).toBe(1);
      expect(fakePublicApi.count(REPLACE_EXERCISE)).toBe(1);
      expect(fakePublicApi.count(ADD_EXERCISE)).toBe(1);
    }
  );
});
