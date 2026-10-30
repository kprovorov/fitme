/**
 * Exercises in the App language (FIT-406): in Ukrainian, Plans, Workout
 * Sessions, the Exercise detail screen and its guide show each Exercise's
 * Ukrainian name, description and instructions; one without a translation is
 * wholly English, and a new App language refetches them. A Library search
 * (FIT-408) finds one by its Ukrainian name and seeds that name.
 *
 * Mounts the real screens on the in-memory Supabase backend and the fake
 * Library holding translated Exercises, under the root layout's
 * language sync; the device language comes from the mocked
 * `expo-localization` (`test-utils/device-locales.ts`).
 */

import { LibraryUnavailableError } from "@fitme/library-sdk";
import type { FakeLibrary } from "@fitme/library-sdk/fake";
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
import ExerciseGuideScreen from "~/app/exercises/[exerciseSlug]/guide";
import ExerciseScreen from "~/app/exercises/[exerciseSlug]/index";
import WorkoutScreen from "~/app/plans/[planId]/workouts/[workoutId]/index";
import HistorySessionScreen from "~/app/workout-sessions/[workoutSessionId]";
import ExercisePickerScreen from "~/app/workout-sessions/[workoutSessionId]/exercise-picker";
import ExercisesView from "~/components/views/exercises-view";
import { i18n, useAppLanguageSync } from "~/lib/i18n";
import { storage } from "~/lib/mmkv";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { libraryExercise, serveLibrary } from "~/test-utils/fake-library";
import { backend } from "~/test-utils/fake-workout-backend";
import {
  createTestQueryClient,
  settle as settleQueries,
  until,
} from "~/test-utils/query-client";

const mockParams: { current: Record<string, string> } = { current: {} };

jest.mock("expo-router", () => {
  const { Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Link: ({ children, href }: { children: ReactNode; href: string }) => (
      <View testID={`link:${href}`}>{children}</View>
    ),
    // A screen's title shows as text.
    Stack: {
      Screen: ({ options }: { options?: { title?: string } }) =>
        options?.title ? <Text testID="title">{options.title}</Text> : null,
    },
    useIsFocused: () => true,
    useLocalSearchParams: () => mockParams.current,
    useNavigation: () => ({ getState: () => ({ index: 0, routes: [{}] }) }),
    useRouter: () => ({
      back: jest.fn(),
      dismiss: jest.fn(),
      dismissTo: jest.fn(),
      push: jest.fn(),
      replace: jest.fn(),
    }),
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
// A thumbnail shows as a view naming its image, or `none`.
jest.mock("~/components/exercises/exercise-image", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return ({ exercise }: { exercise: { thumbnail_url: string | null } }) => (
    <View testID={`thumbnail:${exercise.thumbnail_url ?? "none"}`} />
  );
});
jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));
jest.mock("~/components/workout-sessions/rest-timer", () => () => null);
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);
jest.mock("~/components/ui/dialog", () =>
  jest.requireActual("~/test-utils/dialog-stub")
);
jest.mock("~/components/ui/dropdown-menu", () => {
  const { Pressable } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    DropdownMenu: ({
      items,
    }: {
      items: Array<{ label: string; onPress?: () => void }>;
    }) =>
      items.map((item) => (
        <Pressable
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

jest.mock("~/components/exercises/exercise-video", () => () => null);

/** Translated into Ukrainian. */
const SQUAT = libraryExercise("squat", {
  description: "About the squat.",
  instructions: "- Stand.\n- Squat down.",
  name: "Squat",
  translations: {
    uk: {
      description: "Про присідання.",
      instructions: "- Станьте.\n- Присядьте.",
      name: "Присідання",
    },
  },
});
/** English only. */
const LUNGE = libraryExercise("lunge", {
  description: "About the lunge.",
  instructions: "- Step forward.",
  name: "Lunge",
});

let queryClient: QueryClient;
let fake: FakeLibrary;

function InAppLanguage({ children }: { children: ReactNode }) {
  useAppLanguageSync();
  return children;
}

const renderScreen = async (
  Screen: () => ReactNode,
  params: Record<string, string>
) => {
  mockParams.current = params;
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <InAppLanguage>
        <Screen />
      </InAppLanguage>
    </QueryClientProvider>
  );
  await settle();
};

/** Waits until every request, query and mutation is done. */
const settle = () => settleQueries(queryClient, () => backend.inFlight === 0);

/** The device (and so the App language) switches while the screen is open. */
const switchDeviceTo = async (languageTag: string) => {
  await act(() => {
    setDeviceLanguages([languageTag]);
  });
  await settle();
};

jest.setTimeout(30_000);

beforeEach(() => {
  jest.clearAllMocks();
  backend.reset();
  storage.clearAll();
  fake = serveLibrary([SQUAT, LUNGE]);
  setDeviceLanguages(["uk-UA"]);
});

// The i18n instance outlives a test; the device goes back to English on its own.
afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("a Plan's Workout", () => {
  beforeEach(() => {
    backend.seedPlan({
      id: "plan-1",
      name: "Strength",
      workouts: [
        {
          exercises: [
            { sets: 3, slug: "squat" },
            { sets: 2, slug: "lunge" },
          ],
          id: "w1",
          name: "Leg Day",
        },
      ],
    });
  });

  it("names its Exercises in Ukrainian, an untranslated one in English", async () => {
    await renderScreen(WorkoutScreen, { planId: "plan-1", workoutId: "w1" });

    expect(await screen.findByText("Присідання")).toBeTruthy();
    expect(screen.getByText("Lunge")).toBeTruthy();
    expect(screen.queryByText("Squat")).toBeNull();
  });

  it("renames them when the App language changes", async () => {
    await renderScreen(WorkoutScreen, { planId: "plan-1", workoutId: "w1" });
    expect(await screen.findByText("Присідання")).toBeTruthy();

    await switchDeviceTo("en-US");

    expect(await screen.findByText("Squat")).toBeTruthy();
    expect(screen.queryByText("Присідання")).toBeNull();

    await switchDeviceTo("uk-UA");

    expect(await screen.findByText("Присідання")).toBeTruthy();
    expect(screen.queryByText("Squat")).toBeNull();
  });
});

describe("a Workout Session", () => {
  it("names its Exercises in Ukrainian, an untranslated one in English", async () => {
    backend.seed({
      exercises: [
        { name: "Squat", sets: [10, 8] },
        { name: "Lunge", sets: [12] },
      ],
      id: "s1",
    });
    await renderScreen(HistorySessionScreen, { workoutSessionId: "s1" });

    expect(await screen.findByText("Присідання")).toBeTruthy();
    expect(screen.getByText("Lunge")).toBeTruthy();
    expect(screen.queryByText("Squat")).toBeNull();
  });
});

describe("an Exercise's detail screen", () => {
  it("shows its Ukrainian name, description and instructions", async () => {
    await renderScreen(ExerciseScreen, { exerciseSlug: "squat" });

    expect(await screen.findByText("Про присідання.")).toBeTruthy();
    expect(screen.getByTestId("title")).toHaveTextContent("Присідання");
    expect(screen.getByText("- Станьте.\n- Присядьте.")).toBeTruthy();
  });

  it("shows an untranslated Exercise wholly in English", async () => {
    await renderScreen(ExerciseScreen, { exerciseSlug: "lunge" });

    expect(await screen.findByText("About the lunge.")).toBeTruthy();
    expect(screen.getByTestId("title")).toHaveTextContent("Lunge");
    expect(screen.getByText("- Step forward.")).toBeTruthy();
  });

  it("follows the App language when it changes", async () => {
    await renderScreen(ExerciseScreen, { exerciseSlug: "squat" });
    expect(await screen.findByText("Про присідання.")).toBeTruthy();

    await switchDeviceTo("en-US");

    expect(await screen.findByText("About the squat.")).toBeTruthy();
    expect(screen.getByTestId("title")).toHaveTextContent("Squat");
  });
});

describe("an Exercise's guide", () => {
  it("shows its Ukrainian name, description and steps", async () => {
    await renderScreen(ExerciseGuideScreen, { exerciseSlug: "squat" });

    expect(await screen.findByText("Про присідання.")).toBeTruthy();
    expect(screen.getByTestId("title")).toHaveTextContent("Присідання");
    expect(screen.getByText("Станьте.")).toBeTruthy();
    expect(screen.getByText("Присядьте.")).toBeTruthy();
  });

  it("shows an untranslated Exercise wholly in English", async () => {
    await renderScreen(ExerciseGuideScreen, { exerciseSlug: "lunge" });

    expect(await screen.findByText("About the lunge.")).toBeTruthy();
    expect(screen.getByText("Step forward.")).toBeTruthy();
  });
});

/**
 * Types a search into the open Library view and waits until the Library has
 * answered it, past the debounce.
 */
const search = async (term: string) => {
  const list = jest.spyOn(fake, "list");
  // Labelled in the App language.
  await fireEvent.changeText(screen.getByLabelText("Пошук вправ"), term);
  await until(() =>
    list.mock.calls.some(([params]) => params?.search === term)
  );
  await settle();
};

describe("searching the Library", () => {
  it("adds the Exercise found by its Ukrainian name to a Workout Session by slug", async () => {
    backend.seed({ exercises: [{ name: "Lunge", sets: [12] }], id: "s1" });
    await renderScreen(ExercisePickerScreen, { workoutSessionId: "s1" });
    expect(screen.getByTestId("title")).toHaveTextContent("Додати вправу");

    await search("прис");
    const [addFirst, ...others] = await screen.findAllByText("Додати");
    expect(others).toHaveLength(0);
    await act(async () => {
      await fireEvent.press(addFirst as NonNullable<typeof addFirst>);
    });
    await settle();

    expect(backend.exercises.at(-1)).toMatchObject({
      exercise_slug: "squat",
      workout_session_id: "s1",
    });
  });

  it("opens a found Exercise's detail screen with its Ukrainian name at once", async () => {
    await renderScreen(() => <ExercisesView />, {});
    await search("squat");
    expect(screen.getByText("Присідання")).toBeTruthy();

    // The Library goes away: the name comes from what the search listed.
    fake.failWith(new LibraryUnavailableError());
    mockParams.current = { exerciseSlug: "squat" };
    await screen.rerender(
      <QueryClientProvider client={queryClient}>
        <InAppLanguage>
          <ExerciseScreen />
        </InAppLanguage>
      </QueryClientProvider>
    );

    expect(screen.getByTestId("title")).toHaveTextContent("Присідання");
  });
});
