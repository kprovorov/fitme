/**
 * The Library tab, an Exercise's screen and its guide on a Ukrainian device:
 * the real screens under the root layout's language sync, on the fake
 * Library. The header is rendered as its title and search bar
 * (`stack-screen-stub`), and the SwiftUI-backed primitives are swapped for
 * plain stand-ins.
 */
import { LibraryUnavailableError } from "@fitme/library-sdk";
import type { FakeLibrary } from "@fitme/library-sdk/fake";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import type { ComponentType } from "react";
import LibraryScreen from "~/app/(tabs)/library/index";
import ExerciseGuideScreen from "~/app/exercises/[exerciseSlug]/guide";
import ExerciseScreen from "~/app/exercises/[exerciseSlug]/index";
import { setMuscleChoice } from "~/hooks/muscle-choice";
import { storage } from "~/lib/mmkv";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { libraryExercise, serveLibrary } from "~/test-utils/fake-library";
import { InAppLanguage } from "~/test-utils/in-app-language";
import {
  createTestQueryClient,
  settle,
  until,
} from "~/test-utils/query-client";
import { SEARCH_BAR_TEST_ID } from "~/test-utils/stack-screen-stub";

const mockSlug = { current: "bench-press" };

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  Stack: {
    Screen: jest.requireActual<typeof import("~/test-utils/stack-screen-stub")>(
      "~/test-utils/stack-screen-stub"
    ).StackScreenStub,
  },
  useLocalSearchParams: () => ({ exerciseSlug: mockSlug.current }),
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);
// A thumbnail and a video show as nothing.
jest.mock("~/components/exercises/exercise-image", () => () => null);
jest.mock("~/components/exercises/exercise-video", () => () => null);
jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

let fake: FakeLibrary;
let client: QueryClient;

const renderInUkrainian = async (Screen: ComponentType) => {
  client = createTestQueryClient();
  await render(
    <QueryClientProvider client={client}>
      <InAppLanguage>
        <Screen />
      </InAppLanguage>
    </QueryClientProvider>
  );
  await settle(client);
};

beforeEach(() => {
  storage.clearAll();
  mockSlug.current = "bench-press";
  fake = serveLibrary([
    libraryExercise("bench-press", {
      muscle_groups: ["chest", "triceps"],
      translations: { uk: { name: "Жим лежачи" } },
    }),
    libraryExercise("deadlift", {
      muscle_groups: ["back"],
      translations: { uk: { name: "Станова тяга" } },
    }),
  ]);
  setDeviceLanguages(["uk-UA"]);
});

describe("the Library tab in Ukrainian", () => {
  it("titles the tab, the search and the Muscles pill in Ukrainian", async () => {
    await renderInUkrainian(LibraryScreen);

    expect(screen.getByText("Бібліотека")).toBeTruthy();
    // The header's search bar: the list has no field of its own.
    expect(screen.getAllByPlaceholderText("Пошук вправ")).toHaveLength(1);
    expect(screen.getByTestId(SEARCH_BAR_TEST_ID).props.placeholder).toBe(
      "Пошук вправ"
    );
    expect(screen.getByRole("button", { name: "М’язи" })).toBeTruthy();
    expect(screen.getByText("Жим лежачи")).toBeTruthy();
  });

  it.each([
    ["its Ukrainian name", "стан"],
    ["its English name", "dead"],
  ])(
    "finds an Exercise by %s from the header search, named in Ukrainian",
    async (_how, text) => {
      await renderInUkrainian(LibraryScreen);

      await fireEvent.changeText(screen.getByLabelText("Пошук вправ"), text);
      await until(() => screen.queryByText("Жим лежачи") === null);
      await settle(client);

      expect(screen.getByText("Станова тяга")).toBeTruthy();
      expect(screen.queryByText("Deadlift")).toBeNull();
    }
  );

  it("names each row's Muscle groups in Ukrainian", async () => {
    await renderInUkrainian(LibraryScreen);

    expect(screen.getByText("Груди, Трицепс")).toBeTruthy();
    expect(screen.getByText("Спина")).toBeTruthy();
  });

  it("opens the Exercise's screen from its row", async () => {
    await renderInUkrainian(LibraryScreen);

    await fireEvent.press(screen.getByText("Жим лежачи"));

    expect(router.push).toHaveBeenCalledWith("/exercises/bench-press");
  });

  it("says no Exercise matches, and offers them all, in Ukrainian", async () => {
    await renderInUkrainian(LibraryScreen);

    // The Muscles sheet confirms a Muscle group no Exercise works.
    await act(() => setMuscleChoice("library", ["quadriceps"]));
    await settle(client);

    expect(screen.getByText("Вправ не знайдено")).toBeTruthy();
    expect(
      screen.getByText(
        "Жодна вправа не підходить. Спробуйте іншу назву чи групу м’язів."
      )
    ).toBeTruthy();

    await fireEvent.press(screen.getByText("Показати всі вправи"));
    await settle(client);
    expect(screen.getByText("Жим лежачи")).toBeTruthy();
  });

  it("clears the header search from the empty state", async () => {
    await renderInUkrainian(LibraryScreen);

    await fireEvent.changeText(screen.getByLabelText("Пошук вправ"), "жодна");
    await until(() => screen.queryByText("Вправ не знайдено") !== null);

    await fireEvent.press(screen.getByText("Показати всі вправи"));
    // The cleared search goes out after the debounce.
    await until(() => screen.queryByText("Вправ не знайдено") === null);
    await settle(client);

    expect(screen.getByLabelText("Пошук вправ").props.value).toBe("");
    expect(screen.getByText("Жим лежачи")).toBeTruthy();
    expect(screen.getByText("Станова тяга")).toBeTruthy();
  });

  it("says the Library couldn't load, in Ukrainian", async () => {
    fake.failWith(new LibraryUnavailableError());
    await renderInUkrainian(LibraryScreen);

    expect(screen.getByText("Не вдалося завантажити вправи")).toBeTruthy();
    expect(
      screen.getByText(
        "Не вдалося завантажити вправи. Перевірте з’єднання і спробуйте ще раз."
      )
    ).toBeTruthy();

    fake.failWith(null);
    await fireEvent.press(screen.getByText("Спробувати ще раз"));
    await settle(client);
    expect(screen.getByText("Жим лежачи")).toBeTruthy();
  });
});

describe.each([
  ["an Exercise's screen", ExerciseScreen],
  ["an Exercise's guide", ExerciseGuideScreen],
])("%s in Ukrainian", (_name, Screen) => {
  it("says the Exercise left the Library", async () => {
    mockSlug.current = "gone-exercise";
    await renderInUkrainian(Screen);

    expect(
      screen.getByText("Цієї вправи більше немає в бібліотеці.")
    ).toBeTruthy();
  });

  it("says the Exercise couldn't load, with a retry", async () => {
    fake.failWith(new LibraryUnavailableError());
    await renderInUkrainian(Screen);

    expect(
      screen.getByText(
        "Не вдалося завантажити вправу. Перевірте з’єднання і спробуйте ще раз."
      )
    ).toBeTruthy();
    expect(screen.getByText("Спробувати ще раз")).toBeTruthy();
  });
});
