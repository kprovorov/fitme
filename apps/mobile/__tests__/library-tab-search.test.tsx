/**
 * The Library tab searches from the native header search bar (FIT-433): the
 * real screen on the fake Library, with the header rendered as its title and
 * search bar (`stack-screen-stub`, typing calls the options' `onChangeText`).
 * The list has no search field of its own; the Exercise picker keeps its own
 * (`components/views/__tests__/exercises-view.test.tsx`).
 */
import { LibraryRateLimitedError } from "@fitme/library-sdk";
import type { FakeLibrary } from "@fitme/library-sdk/fake";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import LibraryScreen from "~/app/(tabs)/library/index";
import { storage } from "~/lib/mmkv";
import { libraryExercise, serveLibrary } from "~/test-utils/fake-library";
import {
  createTestQueryClient,
  settle,
  until,
} from "~/test-utils/query-client";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  Stack: {
    Screen: jest.requireActual<typeof import("~/test-utils/stack-screen-stub")>(
      "~/test-utils/stack-screen-stub"
    ).StackScreenStub,
  },
}));
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);
jest.mock("~/components/ui/picker", () =>
  jest.requireActual("~/test-utils/picker-stub")
);
// A thumbnail shows as nothing.
jest.mock("~/components/exercises/exercise-image", () => () => null);
jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

let fake: FakeLibrary;
let list: jest.SpiedFunction<FakeLibrary["list"]>;
let client: QueryClient;

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
  fake = serveLibrary([
    libraryExercise("bench-press"),
    libraryExercise("squat", { muscle_groups: ["quadriceps"] }),
  ]);
  list = jest.spyOn(fake, "list");
});

describe("the Library tab's header search", () => {
  it("is the only search field, placeholdered from the catalogs", async () => {
    await renderLibrary();

    expect(screen.getAllByPlaceholderText("Search exercises")).toHaveLength(1);
    expect(screen.getByTestId("header-search-bar")).toBeTruthy();
    expect(screen.getByText("Bench Press")).toBeTruthy();
    expect(screen.getByText("Squat")).toBeTruthy();
  });

  it("filters the list once the User stops typing", async () => {
    await renderLibrary();
    list.mockClear();

    await fireEvent.changeText(searchBar(), "squ");
    // Nothing goes out until the 300 ms debounce has passed.
    expect(list).not.toHaveBeenCalled();
    await until(() => screen.queryByText("Bench Press") === null);
    await settle(client);

    expect(list).toHaveBeenLastCalledWith({
      limit: 20,
      offset: 0,
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
    list.mockClear();

    const { refreshControl } = screen.getByTestId("exercises-list").props;
    await act(() => refreshControl.props.onRefresh());
    await settle(client);

    expect(list).toHaveBeenCalledWith({ limit: 20, offset: 0, search: "squ" });
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
      fake.failWith(new LibraryRateLimitedError(30));

      await fireEvent.changeText(searchBar(), "squ");
      await advance(300);

      expect(list).toHaveBeenLastCalledWith({
        limit: 20,
        offset: 0,
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
