import { LibraryUnavailableError } from "@fitme/library-sdk";
/**
 * Exercises in the App language (FIT-406): in Ukrainian, Plans, Workout
 * Sessions, the Exercise detail screen and its guide show each Exercise's
 * Ukrainian name, description and instructions; one without a translation is
 * wholly English, and a new App language refetches them. A Library search
 * (FIT-408) finds one by its Ukrainian name and seeds that name.
 *
 * Mounts the real screens on the fake Public API and the fake Library holding translated Exercises, under the root layout's
 * language sync; the device language comes from the mocked
 * `expo-localization` (`test-utils/device-locales.ts`).
 */
import type { FakeLibrary } from "@fitme/library-sdk/fake";
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
import { it, afterEach, describe, expect, beforeEach } from "vitest";

import LibraryScreen from "~/app/(tabs)/library/index";
import ExerciseGuideScreen from "~/app/exercises/[exerciseSlug]/guide";
import ExerciseScreen from "~/app/exercises/[exerciseSlug]/index";
import WorkoutScreen from "~/app/plans/[planId]/workouts/[workoutId]/index";
import HistorySessionScreen from "~/app/workout-sessions/[workoutSessionId]";
import ExercisePickerScreen from "~/app/workout-sessions/[workoutSessionId]/exercise-picker";
import { i18n, useAppLanguageSync } from "~/lib/i18n";
import { storage } from "~/lib/mmkv";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { libraryExercise, serveLibrary } from "~/test-utils/fake-library";
import { backend, fakePublicApi } from "~/test-utils/fake-public-api";
import {
  createTestQueryClient,
  settle as settleQueries,
  until,
} from "~/test-utils/query-client";

const mockParams: { current: Record<string, string> } = { current: {} };

// The real Clerk SDK (reached through the Workout Session's writes) opens a
// MessagePort at import that keeps Jest alive.
jest.mock<typeof import("~/lib/clerk")>(import("~/lib/clerk"), () => ({
  getCurrentUserId: jest.requireActual<
    typeof import("~/test-utils/signed-in-user")
  >("~/test-utils/signed-in-user").getCurrentUserId,
}));

jest.mock<typeof import("expo-router")>(import("expo-router"), () => {
  const { Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");

  const { SearchBar } = jest.requireActual<
    typeof import("~/test-utils/stack-screen-stub")
  >("~/test-utils/stack-screen-stub");

  return {
    Link: ({ children, href }: { children: ReactNode; href: string }) => (
      <View testID={`link:${href}`}>{children}</View>
    ),
    router: { push: jest.fn() },
    // A screen's title shows as text, its header search bar as a field.
    Stack: {
      Screen: ({
        options,
      }: {
        options?: {
          headerSearchBarOptions?: import("react-native-screens").SearchBarProps;
          title?: string;
        };
      }) => (
        <>
          {options?.title ? <Text testID="title">{options.title}</Text> : null}
          {options?.headerSearchBarOptions ? (
            <SearchBar options={options.headerSearchBarOptions} />
          ) : null}
        </>
      ),
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

jest.mock<typeof import("~/lib/library")>(
  import("~/lib/library"),
  () =>
    jest.requireActual<typeof import("~/test-utils/fake-library")>(
      "~/test-utils/fake-library"
    ).libraryModule
);

jest.mock<typeof import("~/hooks/queries/profiles")>(
  import("~/hooks/queries/profiles"),
  () => ({
    useProfileQuery: () => ({ data: { measurement_system: "metric" } }),
  })
);

jest.mock<typeof import("@sentry/react-native")>(
  import("@sentry/react-native"),
  () => ({ captureException: jest.fn() })
);

jest.mock<typeof import("~/lib/segment")>(import("~/lib/segment"), () => ({
  segmentClient: { track: jest.fn() },
}));

jest.mock<typeof import("react-native-safe-area-context")>(
  import("react-native-safe-area-context"),
  () => ({
    useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
  })
);

jest.mock<typeof import("react-native-keyboard-controller")>(
  import("react-native-keyboard-controller"),
  () => {
    const { ScrollView } =
      jest.requireActual<typeof import("react-native")>("react-native");

    return { KeyboardAwareScrollView: ScrollView };
  }
);

// A thumbnail shows as a view naming its image, or `none`.
jest.mock<typeof import("~/components/exercises/exercise-image")>(
  import("~/components/exercises/exercise-image"),
  () => {
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");

    return ({ exercise }: { exercise: { thumbnail_url: string | null } }) => (
      <View testID={`thumbnail:${exercise.thumbnail_url ?? "none"}`} />
    );
  }
);

jest.mock<typeof import("~/components/symbol-image")>(
  import("~/components/symbol-image"),
  () => ({ SymbolImage: () => null })
);

jest.mock<typeof import("~/components/workout-sessions/rest-timer")>(
  import("~/components/workout-sessions/rest-timer"),
  () => () => null
);

jest.mock<typeof import("~/components/ui/button")>(
  import("~/components/ui/button"),
  () => jest.requireActual("~/test-utils/button-stub")
);

jest.mock<typeof import("~/components/ui/dialog")>(
  import("~/components/ui/dialog"),
  () => jest.requireActual("~/test-utils/dialog-stub")
);

jest.mock<typeof import("~/components/ui/dropdown-menu")>(
  import("~/components/ui/dropdown-menu"),
  () => {
    const { Pressable } =
      jest.requireActual<typeof import("react-native")>("react-native");

    return {
      DropdownMenu: ({
        items,
      }: {
        items: { label: string; onPress?: () => void }[];
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
  }
);

jest.mock<typeof import("~/components/exercises/exercise-video")>(
  import("~/components/exercises/exercise-video"),
  () => () => null
);

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
const settle = () =>
  settleQueries(queryClient, () => fakePublicApi.inFlight === 0);

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

    await expect(screen.findByText("Присідання")).resolves.toBeTruthy();
    expect(screen.getByText("Lunge")).toBeTruthy();
    expect(screen.queryByText("Squat")).toBeNull();
  });

  it("renames them when the App language changes", async () => {
    await renderScreen(WorkoutScreen, { planId: "plan-1", workoutId: "w1" });
    await expect(screen.findByText("Присідання")).resolves.toBeTruthy();

    await switchDeviceTo("en-US");

    await expect(screen.findByText("Squat")).resolves.toBeTruthy();
    expect(screen.queryByText("Присідання")).toBeNull();

    await switchDeviceTo("uk-UA");

    await expect(screen.findByText("Присідання")).resolves.toBeTruthy();
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

    await expect(screen.findByText("Присідання")).resolves.toBeTruthy();
    expect(screen.getByText("Lunge")).toBeTruthy();
    expect(screen.queryByText("Squat")).toBeNull();
  });
});

describe("an Exercise's detail screen", () => {
  it("shows its Ukrainian name, description and instructions", async () => {
    await renderScreen(ExerciseScreen, { exerciseSlug: "squat" });

    await expect(screen.findByText("Про присідання.")).resolves.toBeTruthy();
    expect(screen.getByTestId("title")).toHaveTextContent("Присідання");
    expect(screen.getByText("- Станьте.\n- Присядьте.")).toBeTruthy();
  });

  it("shows an untranslated Exercise wholly in English", async () => {
    await renderScreen(ExerciseScreen, { exerciseSlug: "lunge" });

    await expect(screen.findByText("About the lunge.")).resolves.toBeTruthy();
    expect(screen.getByTestId("title")).toHaveTextContent("Lunge");
    expect(screen.getByText("- Step forward.")).toBeTruthy();
  });

  it("follows the App language when it changes", async () => {
    await renderScreen(ExerciseScreen, { exerciseSlug: "squat" });
    await expect(screen.findByText("Про присідання.")).resolves.toBeTruthy();

    await switchDeviceTo("en-US");

    await expect(screen.findByText("About the squat.")).resolves.toBeTruthy();
    expect(screen.getByTestId("title")).toHaveTextContent("Squat");
  });
});

describe("an Exercise's guide", () => {
  it("shows its Ukrainian name, description and steps", async () => {
    await renderScreen(ExerciseGuideScreen, { exerciseSlug: "squat" });

    await expect(screen.findByText("Про присідання.")).resolves.toBeTruthy();
    expect(screen.getByTestId("title")).toHaveTextContent("Присідання");
    expect(screen.getByText("Станьте.")).toBeTruthy();
    expect(screen.getByText("Присядьте.")).toBeTruthy();
  });

  it("shows an untranslated Exercise wholly in English", async () => {
    await renderScreen(ExerciseGuideScreen, { exerciseSlug: "lunge" });

    await expect(screen.findByText("About the lunge.")).resolves.toBeTruthy();
    expect(screen.getByText("Step forward.")).toBeTruthy();
  });
});

/**
 * Types a search into the open screen's header search bar and waits until the Library has
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

// A picker row adding its Exercise ("Додати вправу «Присідання»").
const ADD_ROW = /^Додати вправу «/;

describe("searching the Library", () => {
  it("adds the Exercise found by its Ukrainian name to a Workout Session by slug", async () => {
    backend.seed({ exercises: [{ name: "Lunge", sets: [12] }], id: "s1" });
    await renderScreen(ExercisePickerScreen, { workoutSessionId: "s1" });
    expect(screen.getByTestId("title")).toHaveTextContent("Додати вправу");

    await search("прис");

    const [addFirst, ...others] = await screen.findAllByRole("button", {
      name: ADD_ROW,
    });

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
    await renderScreen(LibraryScreen, {});
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
