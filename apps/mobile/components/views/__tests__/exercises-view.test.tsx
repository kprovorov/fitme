/**
 * The Library tab and the Exercise picker search the Exercise Library API
 * (FIT-242): search waits 300 ms after the last keystroke, the muscle group
 * filter and paging go through `list`, a 429 keeps the last results with no
 * error, and every result is seeded into its row query and MMKV.
 *
 * Mounts the real view on the fake Exercise Library; the SwiftUI-backed
 * primitives are swapped for plain stand-ins.
 */

import {
  ExerciseLibraryRateLimitedError,
  ExerciseLibraryUnavailableError,
  type ExerciseSummary,
} from "@fitme/exercise-library";
import type { FakeExerciseLibrary } from "@fitme/exercise-library/fake";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import ExercisesView from "~/components/views/exercises-view";
import { readCachedSummary } from "~/lib/exercise-cache";
import { storage } from "~/lib/mmkv";
import {
  libraryExercise,
  serveLibrary,
} from "~/test-utils/fake-exercise-library";

jest.mock(
  "~/lib/exercise-library",
  () =>
    jest.requireActual<typeof import("~/test-utils/fake-exercise-library")>(
      "~/test-utils/fake-exercise-library"
    ).exerciseLibraryModule
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

let fake: FakeExerciseLibrary;
let list: jest.SpiedFunction<FakeExerciseLibrary["list"]>;
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
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  await render(
    <QueryClientProvider client={queryClient}>
      <ExercisesView {...props} />
    </QueryClientProvider>
  );
  await advance(0);
};

const type = async (text: string) => {
  const input = screen.getByLabelText("Search exercises");
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

describe("searching the Exercise Library", () => {
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

    fake.failWith(new ExerciseLibraryRateLimitedError(30));
    await type("bench press 1");
    await advance(300);

    expect(screen.getByText("Bench Press 01")).toBeTruthy();
    expect(screen.queryByText(COULD_NOT_LOAD)).toBeNull();
  });

  it("holds the next search back until Retry-After has passed", async () => {
    await renderView();
    fake.failWith(new ExerciseLibraryRateLimitedError(30));
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
    fake.failWith(new ExerciseLibraryUnavailableError());
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
    fake.failWith(new ExerciseLibraryRateLimitedError(30));
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
    fake.failWith(new ExerciseLibraryUnavailableError());

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
    fake.failWith(new ExerciseLibraryRateLimitedError(30));
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
    fake.failWith(new ExerciseLibraryUnavailableError());

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
      queryClient.getQueryData<ExerciseSummary>(["exercise-summary", "squat"])
    ).toBeUndefined();
    expect(
      queryClient.getQueryData<ExerciseSummary>([
        "exercise-summary",
        "bench-press-01",
      ])
    ).toMatchObject({ name: "Bench Press 01", slug: "bench-press-01" });
    expect(readCachedSummary("bench-press-01")?.value).toMatchObject({
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
