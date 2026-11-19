import type { LegacyMuscleGroup } from "@fitme/core";
/**
 * The Library tab and the Exercise picker search the Library through the
 * Public API's `GET /v1/exercises` (FIT-242, FIT-755): search waits 300 ms
 * after the last keystroke, the muscle group filter and paging go through it,
 * a 429 keeps the last results with no
 * error, and every result is seeded into its row query and MMKV. In the App
 * language (FIT-408) it searches and lists in that language. The list is
 * virtualised and loads the next page as the User nears its end (FIT-431).
 *
 * Mounts the real view on the fake Public API's Exercise routes; the SwiftUI-backed
 * primitives are swapped for plain stand-ins. The Muscle group choice is set
 * as the Muscles sheet confirms it (`setMuscleChoice`); the sheet itself is
 * `__tests__/muscles-sheet.test.tsx`'s.
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
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Text } from "react-native";

import { getMuscleChoice, setMuscleChoice } from "~/hooks/muscle-choice";
import type { ExerciseSummary } from "~/lib/exercises";
import { i18n, useAppLanguageSync } from "~/lib/i18n";
import { readCachedSummary } from "~/lib/library-cache";
import { storage } from "~/lib/mmkv";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import {
  EXERCISES_UNAVAILABLE,
  exercisesRateLimited,
  failExercises,
  fakeExercise,
  serveExercises,
} from "~/test-utils/fake-exercises";
import { fakePublicApi } from "~/test-utils/fake-public-api";
import { createTestQueryClient } from "~/test-utils/query-client";
import { SearchedExercisesView } from "~/test-utils/searched-exercises-view";

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// A thumbnail shows as nothing.
jest.mock("~/components/exercises/exercise-image", () => () => null);

jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

/** 25 bench presses (two pages of 20) and a squat. */
const EXERCISES = [
  ...Array.from({ length: 25 }, (_, index) =>
    fakeExercise(`bench-press-${String(index + 1).padStart(2, "0")}`, {
      name: `Bench Press ${String(index + 1).padStart(2, "0")}`,
    })
  ),
  fakeExercise("squat", { muscle_groups: ["quadriceps"], name: "Squat" }),
];

const COULD_NOT_LOAD = /Couldn't load/u;
const LOAD_MORE = /load more$/iu;

const LOAD_MORE_ERROR =
  "Couldn't load more exercises. Check your connection and try again.";

/** Any row's subtitle: Muscle groups, one or joined with ", ". */
const MUSCLE_GROUP_SUBTITLE = /, |^(Triceps|Chest)$/u;

let queryClient: QueryClient;

/** The request the next `listCalls` counts from. */
let firstCounted = 0;

/** Counts only the requests sent from now on. */
const markRequests = () => {
  firstCounted = fakePublicApi.requests.length;
};

/** The query of every `GET /v1/exercises` sent since `markRequests`. */
const listCalls = () =>
  fakePublicApi.requests
    .slice(firstCounted)
    .filter((request) => request.route === "GET /v1/exercises")
    .map((request) => request.query);

/**
 * Whether the list holds the Exercise, rendered or not yet (it's
 * virtualised): every listed Exercise is seeded into its row query.
 */
const isListed = (slug: string) =>
  queryClient.getQueryData(["exercise-summary", "en", slug]) !== undefined;

/** The User pulls the list down to refresh it. */
const pullToRefresh = async () => {
  const { refreshControl } = screen.getByTestId("exercises-list").props;
  await act(() => refreshControl.props.onRefresh());
  await advance(0);
};

/** Moves the clock `ms` (plus a few ms), letting the debounce, the fake's answer and react-query's batching run. */
const tick = async () => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1);
  });
};

const advance = async (ms: number) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
  // React commits at the end of each act, and react-query notifies a tick
  // later: give the chain a few of each.
  await tick();
  await tick();
  await tick();
};

/** The view's Muscle group choice. */
const CHOICE = "view";

/** The Muscles sheet confirms `groups` for the view. */
const chooseMuscleGroups = async (...groups: LegacyMuscleGroup[]) => {
  await act(() => setMuscleChoice(CHOICE, groups));
};

const renderView = async (
  props: Partial<Parameters<typeof SearchedExercisesView>[0]> = {}
) => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <SearchedExercisesView muscleChoiceKey={CHOICE} {...props} />
    </QueryClientProvider>
  );
  await advance(0);
};

/** A drag let go at `fromEnd` points above the end of a list two screens long. */
const dragEnd = (fromEnd: number) => ({
  nativeEvent: {
    contentOffset: { x: 0, y: 1600 - 800 - fromEnd },
    contentSize: { height: 1600, width: 400 },
    layoutMeasurement: { height: 800, width: 400 },
  },
});

/** The User scrolls to the end of the list: the drag ends there, and the list says so. */
const reachEnd = async () => {
  const results = screen.getByTestId("exercises-list");
  await fireEvent(results, "scrollEndDrag", dragEnd(0));
  await fireEvent(results, "endReached");
};

const type = async (text: string) => {
  // Labelled in the App language.
  const input = screen.getByLabelText(i18n.t("library.search"));

  for (const end of text.split("").keys()) {
    // biome-ignore lint/performance/noAwaitInLoops: keystrokes come one after another
    // oxlint-disable-next-line eslint/no-await-in-loop -- Keystrokes and debounce time advance sequentially.
    await fireEvent.changeText(input, text.slice(0, end + 1));
    // oxlint-disable-next-line eslint/no-await-in-loop -- Each keystroke waits before the next character.
    await advance(50);
  }
};

beforeEach(() => {
  jest.useFakeTimers();
  storage.clearAll();
  firstCounted = 0;
  serveExercises(EXERCISES);
});

afterEach(() => {
  queryClient.clear();
  jest.useRealTimers();
});

describe("searching the Library", () => {
  it("lists the first page of every Exercise at once", async () => {
    await renderView();

    expect(listCalls()).toHaveLength(1);
    expect(listCalls().at(-1)).toEqual({ limit: "20", offset: "0" });
    expect(screen.getByText("Bench Press 01")).toBeTruthy();
    expect(screen.queryByText("Bench Press 21")).toBeNull();
  });

  it("sends one search 300 ms after the last keystroke, not one per character", async () => {
    await renderView();
    markRequests();

    // The last keystroke was ~55 ms ago.
    await type("squat");
    await advance(200);
    expect(listCalls()).toHaveLength(0);

    // oxlint-disable-next-line eslint/no-await-in-loop -- Each keystroke waits before the next character.
    await advance(50);
    expect(listCalls()).toHaveLength(1);
    expect(listCalls().at(-1)).toEqual({
      limit: "20",
      offset: "0",
      search: "squat",
    });
    expect(screen.getByText("Squat")).toBeTruthy();
    expect(screen.queryByText("Bench Press 01")).toBeNull();
  });

  it("keeps the last results with no error when rate limited", async () => {
    await renderView();
    await type("bench");
    await advance(300);
    expect(screen.getByText("Bench Press 01")).toBeTruthy();

    failExercises(exercisesRateLimited(30));
    await type("bench press 1");
    await advance(300);

    expect(screen.getByText("Bench Press 01")).toBeTruthy();
    expect(screen.queryByText(COULD_NOT_LOAD)).toBeNull();
  });

  it("holds the next search back until Retry-After has passed", async () => {
    await renderView();
    failExercises(exercisesRateLimited(30));
    await type("bench");
    await advance(300);
    const rateLimitedCalls = listCalls().length;

    failExercises(null);
    await type("squat");
    await advance(10_000);
    expect(listCalls()).toHaveLength(rateLimitedCalls);

    await advance(30_000);
    expect(listCalls().at(-1)).toEqual({
      limit: "20",
      offset: "0",
      search: "squat",
    });
    expect(screen.getByText("Squat")).toBeTruthy();
  });

  it("shows the error state for any other failure, and retries", async () => {
    failExercises(EXERCISES_UNAVAILABLE);
    await renderView();
    // It retries once, a second later, before it gives up.
    await advance(1000);

    expect(
      screen.getByText(
        "Couldn't load exercises. Check your connection and try again."
      )
    ).toBeTruthy();

    failExercises(null);
    await fireEvent.press(screen.getByText("Try Again"));
    await advance(0);
    expect(screen.getByText("Bench Press 01")).toBeTruthy();
  });

  it("says when nothing matches, and shows every Exercise again", async () => {
    await renderView();
    await type("deadlift");
    await advance(300);

    expect(
      screen.getByText("No exercises match. Try another name or muscle group.")
    ).toBeTruthy();

    await fireEvent.press(screen.getByText("Show All Exercises"));
    await advance(300);
    expect(screen.getByText("Bench Press 01")).toBeTruthy();
  });

  it("clears the search and every chosen Muscle group on Show All Exercises", async () => {
    await chooseMuscleGroups("quadriceps", "chest");
    await renderView();
    await type("deadlift");
    await advance(300);

    await fireEvent.press(screen.getByText("Show All Exercises"));
    await advance(0);

    expect(getMuscleChoice(CHOICE)).toEqual([]);
    expect(listCalls().at(-1)).toEqual({ limit: "20", offset: "0" });
    expect(screen.getByLabelText("Search exercises").props.value).toBe("");
    expect(screen.getByText("Bench Press 01")).toBeTruthy();
  });
});

describe("filtering and paging", () => {
  it("has no chip row when nothing is chosen", async () => {
    await renderView();

    expect(screen.queryByTestId("choice-chips")).toBeNull();
  });

  it("removes a Muscle group from its chip at once, and the last chip leaves no row", async () => {
    await chooseMuscleGroups("quadriceps", "chest");
    await renderView();
    markRequests();

    const chips = screen.getByTestId("choice-chips");
    expect(chips.props.className).toContain("flex-wrap");
    expect(
      within(chips)
        .getAllByRole("button")
        .map((chip) => chip.props.accessibilityLabel)
    ).toEqual(["Remove Chest", "Remove Quadriceps"]);

    await fireEvent.press(screen.getByRole("button", { name: "Remove Chest" }));
    await advance(0);

    expect(listCalls()).toHaveLength(1);
    expect(listCalls().at(-1)).toEqual({
      limit: "20",
      muscle_groups: "quadriceps",
      offset: "0",
    });
    expect(screen.getByText("Squat")).toBeTruthy();
    expect(screen.queryByText("Bench Press 01")).toBeNull();

    await fireEvent.press(
      screen.getByRole("button", { name: "Remove Quadriceps" })
    );
    await advance(0);

    expect(listCalls().at(-1)).toEqual({ limit: "20", offset: "0" });
    expect(screen.queryByTestId("choice-chips")).toBeNull();
    expect(screen.getByText("Bench Press 01")).toBeTruthy();
  });

  it("filters by the chosen Muscle groups at once", async () => {
    await renderView();
    markRequests();

    await chooseMuscleGroups("quadriceps");
    await advance(0);

    expect(listCalls()).toHaveLength(1);
    expect(listCalls().at(-1)).toEqual({
      limit: "20",
      muscle_groups: "quadriceps",
      offset: "0",
    });
    expect(screen.getByText("Squat")).toBeTruthy();
    expect(screen.queryByText("Bench Press 01")).toBeNull();
  });

  it("lists Exercises working any chosen Muscle group", async () => {
    await renderView();

    await chooseMuscleGroups("quadriceps", "chest");
    await advance(0);

    expect(listCalls().at(-1)).toEqual({
      limit: "20",
      muscle_groups: "chest,quadriceps",
      offset: "0",
    });
    expect(screen.getByText("Bench Press 01")).toBeTruthy();
    // The squat comes after the 25 bench presses, on the next page.
    await reachEnd();
    await advance(0);
    expect(isListed("squat")).toBe(true);
  });

  it("reuses a choice's results, whatever order it was ticked in", async () => {
    await renderView();
    await chooseMuscleGroups("quadriceps", "chest");
    await advance(0);
    await chooseMuscleGroups();
    await advance(0);
    markRequests();

    await chooseMuscleGroups("chest", "quadriceps");
    await advance(0);

    expect(listCalls()).toHaveLength(0);
    expect(screen.getByText("Bench Press 01")).toBeTruthy();
  });

  it("opens the Muscles sheet on the view's own choice", async () => {
    await renderView();
    mockPush.mockClear();

    await fireEvent.press(screen.getByRole("button", { name: "Muscles" }));

    expect(mockPush).toHaveBeenCalledWith({
      params: { choice: CHOICE },
      pathname: "/muscles",
    });
  });

  it("keeps the Muscles sheet shut while the screen says so (the picker saving)", async () => {
    await renderView({ musclesDisabled: true });
    mockPush.mockClear();

    const pill = screen.getByRole("button", { name: "Muscles" });
    expect(pill.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(pill);

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("pages a Muscle group with its filter", async () => {
    await chooseMuscleGroups("chest");
    await renderView();
    markRequests();

    await reachEnd();
    await advance(0);

    expect(listCalls().at(-1)).toEqual({
      limit: "20",
      muscle_groups: "chest",
      offset: "20",
    });
  });

  it("sends a new muscle group at once, with the search being typed", async () => {
    await renderView();
    markRequests();

    await fireEvent.changeText(screen.getByLabelText("Search exercises"), "sq");
    await chooseMuscleGroups("quadriceps");
    await advance(0);

    expect(listCalls()).toHaveLength(1);
    expect(listCalls().at(-1)).toEqual({
      limit: "20",
      muscle_groups: "quadriceps",
      offset: "0",
      search: "sq",
    });
  });

  it("starts from the screen's choice", async () => {
    await chooseMuscleGroups("quadriceps");
    await renderView();

    expect(listCalls().at(-1)).toEqual({
      limit: "20",
      muscle_groups: "quadriceps",
      offset: "0",
    });
  });

  it("loads the next page at the end of the list, and stops when there are no more", async () => {
    await renderView({});
    await type("bench");
    await advance(300);
    markRequests();

    await reachEnd();
    await advance(0);

    expect(listCalls()).toHaveLength(1);
    expect(listCalls().at(-1)).toEqual({
      limit: "20",
      offset: "20",
      search: "bench",
    });
    expect(isListed("bench-press-25")).toBe(true);

    await reachEnd();
    await advance(0);
    expect(listCalls()).toHaveLength(1);
  });

  it("has no Load More button", async () => {
    await renderView();

    expect(screen.queryByText("Load More")).toBeNull();
    expect(screen.queryByText(LOAD_MORE)).toBeNull();
  });

  it("shows a loading indicator at the bottom while the next page loads", async () => {
    await renderView();
    failExercises(exercisesRateLimited(30));
    await reachEnd();
    await advance(0);
    failExercises(null);

    // Held back by the 429, the next page is on its way.
    await reachEnd();
    await advance(0);

    expect(screen.getByText("Bench Press 01")).toBeTruthy();
    expect(screen.getByTestId("exercises-loading-more")).toBeTruthy();

    await advance(30_000);
    expect(screen.queryByTestId("exercises-loading-more")).toBeNull();
    expect(isListed("squat")).toBe(true);
  });

  it("never asks again for a page already on its way", async () => {
    await renderView();
    failExercises(exercisesRateLimited(30));
    await reachEnd();
    await advance(0);
    failExercises(null);
    markRequests();

    await reachEnd();
    await reachEnd();
    await reachEnd();
    await advance(30_000);

    expect(listCalls()).toHaveLength(1);
    expect(listCalls().at(-1)).toEqual({ limit: "20", offset: "20" });
  });
});

describe("after a 429", () => {
  it("holds loading the next page back until Retry-After has passed", async () => {
    await renderView();
    failExercises(exercisesRateLimited(30));
    await reachEnd();
    await advance(0);
    expect(screen.getByText("Bench Press 01")).toBeTruthy();
    expect(screen.queryByText(COULD_NOT_LOAD)).toBeNull();
    failExercises(null);
    markRequests();

    await reachEnd();
    await advance(10_000);
    expect(listCalls()).toHaveLength(0);

    await advance(20_000);
    expect(listCalls().at(-1)).toEqual({ limit: "20", offset: "20" });
    expect(isListed("squat")).toBe(true);
  });
});

describe("a failed refresh", () => {
  it("shows the error state over the results it had", async () => {
    await renderView({ refreshable: true });
    failExercises(EXERCISES_UNAVAILABLE);

    await pullToRefresh();
    await advance(1000);

    expect(screen.getByText("Couldn't Load Exercises")).toBeTruthy();
    expect(screen.queryByText("Bench Press 01")).toBeNull();
  });

  it("never pages past the error state when the shortened list reaches its end", async () => {
    await renderView({ refreshable: true });
    failExercises(EXERCISES_UNAVAILABLE);
    await pullToRefresh();
    await advance(1000);
    failExercises(null);
    markRequests();

    await reachEnd();
    await advance(0);

    expect(listCalls()).toHaveLength(0);
    expect(screen.getByText("Couldn't Load Exercises")).toBeTruthy();
    expect(screen.getByText("Try Again")).toBeTruthy();
  });
});

describe("the Retry-After hold", () => {
  it("holds the Exercise picker back too, after the Library tab was rate limited", async () => {
    await renderView();
    failExercises(exercisesRateLimited(30));
    await type("bench");
    await advance(300);
    failExercises(null);
    markRequests();

    // The picker opens in the same app (same query client) for a squat.
    await chooseMuscleGroups("quadriceps");
    await screen.rerender(
      <QueryClientProvider client={queryClient}>
        <SearchedExercisesView key="picker" muscleChoiceKey={CHOICE} />
      </QueryClientProvider>
    );
    await advance(10_000);
    expect(listCalls()).toHaveLength(0);

    await advance(20_000);
    expect(listCalls().at(-1)).toEqual({
      limit: "20",
      muscle_groups: "quadriceps",
      offset: "0",
    });
    expect(screen.getByText("Squat")).toBeTruthy();
  });
});

describe("a failed next page", () => {
  it("keeps the results and says it couldn't load more", async () => {
    await renderView();
    failExercises(EXERCISES_UNAVAILABLE);

    await reachEnd();
    await advance(1000);

    expect(screen.getByText("Bench Press 01")).toBeTruthy();
    expect(screen.getByText(LOAD_MORE_ERROR)).toBeTruthy();
  });

  it("asks again only once the User scrolls to the end again", async () => {
    await renderView();
    failExercises(EXERCISES_UNAVAILABLE);
    await reachEnd();
    await advance(1000);
    failExercises(null);
    markRequests();

    // The message lengthening the list reaches its end with no scroll.
    await fireEvent(screen.getByTestId("exercises-list"), "endReached");
    await advance(0);
    // A drag ending far from the end leaves it alone.
    await fireEvent(
      screen.getByTestId("exercises-list"),
      "scrollEndDrag",
      dragEnd(1200)
    );
    await advance(0);
    expect(listCalls()).toHaveLength(0);
    expect(screen.getByText(LOAD_MORE_ERROR)).toBeTruthy();

    // Dragged at the end again: the list reports no new end, the drag retries.
    await fireEvent(
      screen.getByTestId("exercises-list"),
      "scrollEndDrag",
      dragEnd(0)
    );
    await advance(0);
    expect(listCalls().at(-1)).toEqual({ limit: "20", offset: "20" });
    expect(screen.queryByText(LOAD_MORE_ERROR)).toBeNull();
    expect(isListed("squat")).toBe(true);
  });

  it("keeps pull to refresh on the Library tab", async () => {
    await renderView({ refreshable: true });
    markRequests();

    await pullToRefresh();

    expect(listCalls().at(-1)).toEqual({ limit: "20", offset: "0" });
    expect(screen.getByText("Bench Press 01")).toBeTruthy();
  });
});

describe("what it lists", () => {
  it("seeds each Exercise's row query and MMKV", async () => {
    await renderView();

    expect(
      queryClient.getQueryData<ExerciseSummary>([
        "exercise-summary",
        "en",
        "squat",
      ])
    ).toBeUndefined();
    expect(
      queryClient.getQueryData<ExerciseSummary>([
        "exercise-summary",
        "en",
        "bench-press-01",
      ])
    ).toMatchObject({ name: "Bench Press 01", slug: "bench-press-01" });
    expect(readCachedSummary("en", "bench-press-01")?.value).toMatchObject({
      name: "Bench Press 01",
    });
  });

  it("hands the pressed Exercise to its CTA by slug", async () => {
    const pressed: string[] = [];
    await renderView({ onExercisePress: ({ slug }) => pressed.push(slug) });

    await fireEvent.press(screen.getByText("Bench Press 02"));

    expect(pressed).toEqual(["bench-press-02"]);
  });
});

describe("each row", () => {
  beforeEach(() => {
    serveExercises([
      fakeExercise("dip", { muscle_groups: ["triceps", "chest"], name: "Dip" }),
      fakeExercise("mystery", { muscle_groups: [], name: "Mystery" }),
    ]);
  });

  it("names the Exercise's Muscle groups in the Library's order", async () => {
    await renderView();

    expect(screen.getByText("Dip")).toBeTruthy();
    expect(screen.getByText("Triceps, Chest")).toBeTruthy();
  });

  it("shows no subtitle for an Exercise without Muscle groups", async () => {
    await renderView();

    expect(screen.getByText("Mystery")).toBeTruthy();
    // The only subtitle is the dip's.
    expect(screen.getAllByText(MUSCLE_GROUP_SUBTITLE)).toHaveLength(1);
  });

  it("ends with the trailing element its screen chose", async () => {
    await renderView({ trailing: <Text>Pick</Text> });

    expect(screen.getAllByText("Pick")).toHaveLength(2);
  });

  it("is a button named as its screen says, picking that Exercise", async () => {
    const picked: string[] = [];
    await renderView({
      onExercisePress: ({ slug }) => {
        picked.push(slug);
      },
      rowAccessibilityLabel: ({ name }) => `Add ${name}`,
    });

    await fireEvent.press(screen.getByRole("button", { name: "Add Dip" }));
    expect(picked).toEqual(["dip"]);
    expect(screen.getByRole("button", { name: "Add Mystery" })).toBeTruthy();
  });
});

/** Translated into Ukrainian, where they sort in another order than in English. */
const TRANSLATED = [
  fakeExercise("bench-press", {
    name: "Bench Press",
    translations: { uk: { name: "Жим лежачи" } },
  }),
  fakeExercise("deadlift", {
    name: "Deadlift",
    translations: { uk: { name: "Станова тяга" } },
  }),
  fakeExercise("squat", {
    name: "Squat",
    translations: { uk: { name: "Присідання" } },
  }),
];

function InAppLanguage({ children }: { children: ReactNode }) {
  useAppLanguageSync();

  return children;
}

/** The view in the App language, following the device as the root layout does. */
const renderInAppLanguage = async () => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <InAppLanguage>
        <SearchedExercisesView muscleChoiceKey={CHOICE} />
      </InAppLanguage>
    </QueryClientProvider>
  );
  await advance(0);
};

/** The names listed, top to bottom. */
const listedNames = (names: readonly string[]) =>
  screen
    .getAllByText(new RegExp(`^(${names.join("|")})$`, "u"))
    .map((element) => element.props.children);

describe("in Ukrainian", () => {
  beforeEach(async () => {
    serveExercises(TRANSLATED);
    setDeviceLanguages(["uk-UA"]);
    await i18n.changeLanguage("uk");
  });

  // The i18n instance outlives a test; the device goes back to English on its own.
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("lists Ukrainian names in Ukrainian order", async () => {
    await renderInAppLanguage();

    expect(listCalls().at(-1)).toEqual({
      language: "uk",
      limit: "20",
      offset: "0",
    });
    expect(listedNames(["Жим лежачи", "Присідання", "Станова тяга"])).toEqual([
      "Жим лежачи",
      "Присідання",
      "Станова тяга",
    ]);
    expect(screen.queryByText("Squat")).toBeNull();
  });

  it("finds an Exercise by its Ukrainian name", async () => {
    await renderInAppLanguage();

    await type("прис");
    await advance(300);

    expect(listCalls().at(-1)).toEqual({
      language: "uk",
      limit: "20",
      offset: "0",
      search: "прис",
    });
    expect(screen.getByText("Присідання")).toBeTruthy();
    expect(screen.queryByText("Жим лежачи")).toBeNull();
  });

  it("finds an Exercise by its English name, named in Ukrainian", async () => {
    await renderInAppLanguage();

    await type("dead");
    await advance(300);

    expect(screen.getByText("Станова тяга")).toBeTruthy();
    expect(screen.queryByText("Deadlift")).toBeNull();
    expect(screen.queryByText("Присідання")).toBeNull();
  });

  it("seeds each Exercise's row query and MMKV in Ukrainian", async () => {
    await renderInAppLanguage();

    expect(
      queryClient.getQueryData<ExerciseSummary>([
        "exercise-summary",
        "uk",
        "squat",
      ])
    ).toMatchObject({ name: "Присідання" });
    expect(readCachedSummary("uk", "squat")?.value).toMatchObject({
      name: "Присідання",
    });
    expect(
      queryClient.getQueryData(["exercise-summary", "en", "squat"])
    ).toBeUndefined();
    expect(readCachedSummary("en", "squat")).toBeUndefined();
  });

  it("searches again when the App language changes", async () => {
    await renderInAppLanguage();
    await type("squat");
    await advance(300);
    expect(screen.getByText("Присідання")).toBeTruthy();
    markRequests();

    await act(() => {
      setDeviceLanguages(["en-US"]);
    });
    await advance(0);

    expect(listCalls()).toHaveLength(1);
    expect(listCalls().at(-1)).toEqual({
      limit: "20",
      offset: "0",
      search: "squat",
    });
    expect(screen.getByText("Squat")).toBeTruthy();
    expect(screen.queryByText("Присідання")).toBeNull();
  });

  it("never keeps another language's results when rate limited", async () => {
    await renderInAppLanguage();
    expect(screen.getByText("Присідання")).toBeTruthy();
    failExercises(exercisesRateLimited(30));

    await act(() => {
      setDeviceLanguages(["en-US"]);
    });
    await advance(0);

    expect(screen.queryByText("Присідання")).toBeNull();
    expect(screen.getByText("Couldn't Load Exercises")).toBeTruthy();
  });
});
