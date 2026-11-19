/**
 * The Library tab searches from the native header search bar (FIT-433): the
 * real screen on the fake Public API's Exercise routes, with the header rendered as its title and
 * search bar (`stack-screen-stub`, typing calls the options' `onChangeText`).
 * The list has no search field of its own; the Exercise picker searches from
 * its own header the same way (`__tests__/workout-session-exercises.test.tsx`).
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import LibraryScreen from "~/app/(tabs)/library/index";
import { storage } from "~/lib/mmkv";
import {
  exercisesRateLimited,
  failExercises,
  fakeExercise,
  serveExercises,
} from "~/test-utils/fake-exercises";
import { fakePublicApi } from "~/test-utils/fake-public-api";
import {
  createTestQueryClient,
  settle,
  until,
} from "~/test-utils/query-client";
import { SEARCH_BAR_TEST_ID } from "~/test-utils/stack-screen-stub";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  Stack: {
    Screen: jest.requireActual<typeof import("~/test-utils/stack-screen-stub")>(
      "~/test-utils/stack-screen-stub"
    ).StackScreenStub,
  },
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

// A thumbnail shows as nothing.
jest.mock("~/components/exercises/exercise-image", () => () => null);

jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

let client: QueryClient;

const LIST_ROUTE = "GET /v1/exercises";

/** The queries of every page asked for since `from` (a request index). */
const listQueries = (from = 0) =>
  fakePublicApi.requests
    .slice(from)
    .filter((request) => request.route === LIST_ROUTE)
    .map((request) => request.query);

const searchBar = () => screen.getByLabelText("Search exercises");

const renderLibrary = async () => {
  client = createTestQueryClient();
  await render(
    <QueryClientProvider client={client}>
      <LibraryScreen />
    </QueryClientProvider>
  );
  await settle(client);
};

/** The User types in the header search bar; the list follows after the debounce. */
const search = async (text: string, shown: string, hidden: string) => {
  await fireEvent.changeText(searchBar(), text);
  await until(
    () => screen.queryByText(hidden) === null && !!screen.queryByText(shown)
  );
  await settle(client);
};

const tick = async () => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1);
  });
};

/** Moves the fake clock `ms`, then lets React and react-query catch up. */
const advance = async (ms: number) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
  await tick();
  await tick();
  await tick();
};

beforeEach(() => {
  storage.clearAll();
  serveExercises([
    fakeExercise("bench-press", { name: "Bench Press" }),
    fakeExercise("squat", { muscle_groups: ["quadriceps"], name: "Squat" }),
  ]);
});

describe("the Library tab's header search", () => {
  it("is the only search field, placeholdered from the catalogs", async () => {
    await renderLibrary();

    expect(screen.getAllByPlaceholderText("Search exercises")).toHaveLength(1);
    expect(screen.getByTestId(SEARCH_BAR_TEST_ID)).toBeTruthy();
    expect(screen.getByText("Bench Press")).toBeTruthy();
    expect(screen.getByText("Squat")).toBeTruthy();
  });

  it("filters the list once the User stops typing", async () => {
    await renderLibrary();
    const from = fakePublicApi.requests.length;

    await fireEvent.changeText(searchBar(), "squ");
    // Nothing goes out until the 300 ms debounce has passed.
    expect(listQueries(from)).toEqual([]);
    await until(() => screen.queryByText("Bench Press") === null);
    await settle(client);

    expect(listQueries(from).at(-1)).toEqual({
      limit: "20",
      offset: "0",
      search: "squ",
    });
    expect(screen.getByText("Squat")).toBeTruthy();
  });

  it("shows the full list again once the search is cleared", async () => {
    await renderLibrary();
    await search("squ", "Squat", "Bench Press");

    await search("", "Bench Press", "No Exercises Found");

    expect(screen.getByText("Squat")).toBeTruthy();
  });

  it("shows the full list again on Cancel", async () => {
    await renderLibrary();
    await search("squ", "Squat", "Bench Press");

    await fireEvent.press(screen.getByLabelText("Cancel"));
    await until(() => screen.queryByText("Bench Press") !== null);
    await settle(client);

    expect(searchBar().props.value).toBe("");
    expect(screen.getByText("Squat")).toBeTruthy();
  });

  it("clears the header search from the empty state", async () => {
    await renderLibrary();
    await fireEvent.changeText(searchBar(), "nothing");
    await until(() => screen.queryByText("No Exercises Found") !== null);

    await fireEvent.press(screen.getByText("Show All Exercises"));
    await until(() => screen.queryByText("No Exercises Found") === null);
    await settle(client);

    expect(searchBar().props.value).toBe("");
    expect(screen.getByText("Bench Press")).toBeTruthy();
    expect(screen.getByText("Squat")).toBeTruthy();
  });

  it("opens a result tapped with the keyboard up", async () => {
    await renderLibrary();
    await search("squ", "Squat", "Bench Press");

    expect(
      screen.getByTestId("exercises-list").props.keyboardShouldPersistTaps
    ).toBe("handled");
    await fireEvent.press(screen.getByText("Squat"));

    expect(router.push).toHaveBeenCalledWith("/exercises/squat");
  });

  it("refreshes the searched list when pulled down", async () => {
    await renderLibrary();
    await search("squ", "Squat", "Bench Press");
    const from = fakePublicApi.requests.length;

    const { refreshControl } = screen.getByTestId("exercises-list").props;
    await act(() => refreshControl.props.onRefresh());
    await settle(client);

    expect(listQueries(from)).toContainEqual({
      limit: "20",
      offset: "0",
      search: "squ",
    });
    expect(screen.getByText("Squat")).toBeTruthy();
  });

  it("keeps the last results, with no error, when rate limited", async () => {
    // Fake timers: the 429 holds the next request back for 30 s.
    jest.useFakeTimers();

    try {
      client = createTestQueryClient();
      await render(
        <QueryClientProvider client={client}>
          <LibraryScreen />
        </QueryClientProvider>
      );
      await advance(0);
      failExercises(exercisesRateLimited(30));

      await fireEvent.changeText(searchBar(), "squ");
      await advance(300);

      expect(listQueries().at(-1)).toEqual({
        limit: "20",
        offset: "0",
        search: "squ",
      });
      expect(screen.getByText("Bench Press")).toBeTruthy();
      expect(screen.getByText("Squat")).toBeTruthy();
      expect(screen.queryByText("Couldn't Load Exercises")).toBeNull();
    } finally {
      client.clear();
      jest.useRealTimers();
    }
  });
});
