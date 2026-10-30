/**
 * The Library tab and the Exercise picker search the Library API
 * (FIT-242): search waits 300 ms after the last keystroke, the muscle group
 * filter and paging go through `list`, a 429 keeps the last results with no
 * error, and every result is seeded into its row query and MMKV. In the App
 * language (FIT-408) it searches and lists in that language.
 *
 * Mounts the real view on the fake Library; the SwiftUI-backed
 * primitives are swapped for plain stand-ins.
 */

import {
  type ExerciseSummary,
  LibraryRateLimitedError,
  LibraryUnavailableError,
} from "@fitme/library-sdk";
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
import { Text } from "react-native";
import ExercisesView from "~/components/views/exercises-view";
import { i18n, useAppLanguageSync } from "~/lib/i18n";
import { readCachedSummary } from "~/lib/library-cache";
import { storage } from "~/lib/mmkv";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { libraryExercise, serveLibrary } from "~/test-utils/fake-library";
import { createTestQueryClient } from "~/test-utils/query-client";

jest.mock(
  "~/lib/library",
  () =>
    jest.requireActual<typeof import("~/test-utils/fake-library")>(
      "~/test-utils/fake-library"
    ).libraryModule
);
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);
jest.mock("~/components/ui/picker", () =>
  jest.requireActual("~/test-utils/picker-stub")
);
// A thumbnail shows as nothing.
jest.mock("~/components/exercises/exercise-image", () => () => null);
jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

/** 25 bench presses (two pages of 20) and a squat. */
const EXERCISES = [
  ...Array.from({ length: 25 }, (_, index) =>
    libraryExercise(`bench-press-${String(index + 1).padStart(2, "0")}`)
  ),
  libraryExercise("squat", { muscle_groups: ["quadriceps"] }),
];

const COULD_NOT_LOAD = /Couldn't load/;
/** Any row's subtitle: Muscle groups, one or joined with ", ". */
const MUSCLE_GROUP_SUBTITLE = /, |^(Triceps|Chest)$/;

let fake: FakeLibrary;
let list: jest.SpiedFunction<FakeLibrary["list"]>;
let queryClient: QueryClient;

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

const renderView = async (props: Parameters<typeof ExercisesView>[0] = {}) => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <ExercisesView {...props} />
    </QueryClientProvider>
  );
  await advance(0);
};

const type = async (text: string) => {
  // Labelled in the App language.
  const input = screen.getByLabelText(i18n.t("library.search"));
  for (const end of text.split("").keys()) {
    // biome-ignore lint/performance/noAwaitInLoops: keystrokes come one after another
    await fireEvent.changeText(input, text.slice(0, end + 1));
    await advance(50);
  }
};

beforeEach(() => {
  jest.useFakeTimers();
  storage.clearAll();
  fake = serveLibrary(EXERCISES);
  list = jest.spyOn(fake, "list");
});

afterEach(() => {
  queryClient.clear();
  jest.useRealTimers();
});

describe("searching the Library", () => {
  it("lists the first page of every Exercise at once", async () => {
    await renderView();

    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenLastCalledWith({ limit: 20, offset: 0 });
    expect(screen.getByText("Bench Press 01")).toBeTruthy();
    expect(screen.queryByText("Bench Press 21")).toBeNull();
  });

  it("sends one search 300 ms after the last keystroke, not one per character", async () => {
    await renderView();
    list.mockClear();

    // The last keystroke was ~55 ms ago.
    await type("squat");
    await advance(200);
    expect(list).not.toHaveBeenCalled();

    await advance(50);
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenLastCalledWith({
      limit: 20,
      offset: 0,
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

    fake.failWith(new LibraryRateLimitedError(30));
    await type("bench press 1");
    await advance(300);

    expect(screen.getByText("Bench Press 01")).toBeTruthy();
    expect(screen.queryByText(COULD_NOT_LOAD)).toBeNull();
  });

  it("holds the next search back until Retry-After has passed", async () => {
    await renderView();
    fake.failWith(new LibraryRateLimitedError(30));
    await type("bench");
    await advance(300);
    const rateLimitedCalls = list.mock.calls.length;

    fake.failWith(null);
    await type("squat");
    await advance(10_000);
    expect(list).toHaveBeenCalledTimes(rateLimitedCalls);

    await advance(30_000);
    expect(list).toHaveBeenLastCalledWith({
      limit: 20,
      offset: 0,
      search: "squat",
    });
    expect(screen.getByText("Squat")).toBeTruthy();
  });

  it("shows the error state for any other failure, and retries", async () => {
    fake.failWith(new LibraryUnavailableError());
    await renderView();
    // It retries once, a second later, before it gives up.
    await advance(1000);

    expect(
      screen.getByText(
        "Couldn't load exercises. Check your connection and try again."
      )
    ).toBeTruthy();

    fake.failWith(null);
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
});

describe("filtering and paging", () => {
  it("filters by muscle group at once", async () => {
    await renderView();
    list.mockClear();

    await fireEvent.press(screen.getByLabelText("Muscle group Quadriceps"));
    await advance(0);

    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenLastCalledWith({
      limit: 20,
      muscleGroup: "quadriceps",
      offset: 0,
    });
    expect(screen.getByText("Squat")).toBeTruthy();
    expect(screen.queryByText("Bench Press 01")).toBeNull();
  });

  it("pages a muscle group with its filter", async () => {
    await renderView({ initialMuscleGroup: "chest" });
    list.mockClear();

    await fireEvent.press(screen.getByText("Load More"));
    await advance(0);

    expect(list).toHaveBeenLastCalledWith({
      limit: 20,
      muscleGroup: "chest",
      offset: 20,
    });
    expect(screen.queryByText("Load More")).toBeNull();
  });

  it("sends a new muscle group at once, with the search being typed", async () => {
    await renderView();
    list.mockClear();

    await fireEvent.changeText(screen.getByLabelText("Search exercises"), "sq");
    await fireEvent.press(screen.getByLabelText("Muscle group Quadriceps"));
    await advance(0);

    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenLastCalledWith({
      limit: 20,
      muscleGroup: "quadriceps",
      offset: 0,
      search: "sq",
    });
  });

  it("starts from the muscle group it's given", async () => {
    await renderView({ initialMuscleGroup: "quadriceps" });

    expect(list).toHaveBeenLastCalledWith({
      limit: 20,
      muscleGroup: "quadriceps",
      offset: 0,
    });
  });

  it("loads the next page, and stops when there are no more", async () => {
    await renderView({});
    await type("bench");
    await advance(300);
    list.mockClear();

    await fireEvent.press(screen.getByText("Load More"));
    await advance(0);

    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenLastCalledWith({
      limit: 20,
      offset: 20,
      search: "bench",
    });
    expect(screen.getByText("Bench Press 25")).toBeTruthy();
    expect(screen.queryByText("Load More")).toBeNull();
  });
});

describe("after a 429", () => {
  it("holds loading the next page back until Retry-After has passed", async () => {
    await renderView();
    fake.failWith(new LibraryRateLimitedError(30));
    await fireEvent.press(screen.getByText("Load More"));
    await advance(0);
    expect(screen.getByText("Bench Press 01")).toBeTruthy();
    expect(screen.queryByText(COULD_NOT_LOAD)).toBeNull();
    fake.failWith(null);
    list.mockClear();

    await fireEvent.press(screen.getByText("Load More"));
    await advance(10_000);
    expect(list).not.toHaveBeenCalled();

    await advance(20_000);
    expect(list).toHaveBeenLastCalledWith({ limit: 20, offset: 20 });
    expect(screen.getByText("Bench Press 25")).toBeTruthy();
  });
});

describe("a failed refresh", () => {
  it("shows the error state over the results it had", async () => {
    let refresh: (() => Promise<void>) | undefined;
    await renderView({
      ref: (handle) => {
        refresh = handle?.refresh;
      },
    });
    fake.failWith(new LibraryUnavailableError());

    await act(async () => {
      const refreshing = refresh?.();
      await jest.advanceTimersByTimeAsync(1000);
      await refreshing;
    });
    await advance(0);

    expect(screen.getByText("Couldn't Load Exercises")).toBeTruthy();
    expect(screen.queryByText("Bench Press 01")).toBeNull();
  });
});

describe("the Retry-After hold", () => {
  it("holds the Exercise picker back too, after the Library tab was rate limited", async () => {
    await renderView();
    fake.failWith(new LibraryRateLimitedError(30));
    await type("bench");
    await advance(300);
    fake.failWith(null);
    list.mockClear();

    // The picker opens in the same app (same query client) for a squat.
    await screen.rerender(
      <QueryClientProvider client={queryClient}>
        <ExercisesView initialMuscleGroup="quadriceps" key="picker" />
      </QueryClientProvider>
    );
    await advance(10_000);
    expect(list).not.toHaveBeenCalled();

    await advance(20_000);
    expect(list).toHaveBeenLastCalledWith({
      limit: 20,
      muscleGroup: "quadriceps",
      offset: 0,
    });
    expect(screen.getByText("Squat")).toBeTruthy();
  });
});

describe("a failed next page", () => {
  it("keeps the results and says it couldn't load more", async () => {
    await renderView();
    fake.failWith(new LibraryUnavailableError());

    await fireEvent.press(screen.getByText("Load More"));
    await advance(1000);

    expect(screen.getByText("Bench Press 01")).toBeTruthy();
    expect(
      screen.getByText(
        "Couldn't load more exercises. Check your connection and try again."
      )
    ).toBeTruthy();
    expect(screen.getByText("Load More")).toBeTruthy();
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
    fake = serveLibrary([
      libraryExercise("dip", { muscle_groups: ["triceps", "chest"] }),
      libraryExercise("mystery", { muscle_groups: [] }),
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

  it("ends with the trailing element its screen chose for that Exercise", async () => {
    await renderView({ trailing: ({ slug }) => <Text>{`Pick ${slug}`}</Text> });

    expect(screen.getByText("Pick dip")).toBeTruthy();
    expect(screen.getByText("Pick mystery")).toBeTruthy();
  });
});

/** Translated into Ukrainian, where they sort in another order than in English. */
const TRANSLATED = [
  libraryExercise("bench-press", {
    translations: { uk: { name: "Жим лежачи" } },
  }),
  libraryExercise("deadlift", {
    translations: { uk: { name: "Станова тяга" } },
  }),
  libraryExercise("squat", { translations: { uk: { name: "Присідання" } } }),
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
        <ExercisesView />
      </InAppLanguage>
    </QueryClientProvider>
  );
  await advance(0);
};

/** The names listed, top to bottom. */
const listedNames = (names: readonly string[]) =>
  screen
    .getAllByText(new RegExp(`^(${names.join("|")})$`))
    .map((element) => element.props.children);

describe("in Ukrainian", () => {
  beforeEach(async () => {
    fake = serveLibrary(TRANSLATED);
    list = jest.spyOn(fake, "list");
    setDeviceLanguages(["uk-UA"]);
    await i18n.changeLanguage("uk");
  });

  // The i18n instance outlives a test; the device goes back to English on its own.
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("lists Ukrainian names in Ukrainian order", async () => {
    await renderInAppLanguage();

    expect(list).toHaveBeenLastCalledWith({
      language: "uk",
      limit: 20,
      offset: 0,
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

    expect(list).toHaveBeenLastCalledWith({
      language: "uk",
      limit: 20,
      offset: 0,
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
    list.mockClear();

    await act(() => {
      setDeviceLanguages(["en-US"]);
    });
    await advance(0);

    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenLastCalledWith({
      limit: 20,
      offset: 0,
      search: "squat",
    });
    expect(screen.getByText("Squat")).toBeTruthy();
    expect(screen.queryByText("Присідання")).toBeNull();
  });

  it("never keeps another language's results when rate limited", async () => {
    await renderInAppLanguage();
    expect(screen.getByText("Присідання")).toBeTruthy();
    fake.failWith(new LibraryRateLimitedError(30));

    await act(() => {
      setDeviceLanguages(["en-US"]);
    });
    await advance(0);

    expect(screen.queryByText("Присідання")).toBeNull();
    expect(screen.getByText("Couldn't Load Exercises")).toBeTruthy();
  });
});
