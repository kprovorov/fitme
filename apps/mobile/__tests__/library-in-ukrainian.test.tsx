/**
 * The Library tab, an Exercise's screen and its guide on a Ukrainian device:
 * the real screens under the root layout's language sync, on the fake
 * Library. The header is rendered as its title, and the SwiftUI-backed
 * primitives are swapped for plain stand-ins (the picker's options are
 * buttons labelled `<label> <option>`).
 */
import { LibraryUnavailableError } from "@fitme/library-sdk";
import type { FakeLibrary } from "@fitme/library-sdk/fake";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import type { ComponentType } from "react";
import { Text } from "react-native";
import LibraryScreen from "~/app/(tabs)/library/index";
import ExerciseGuideScreen from "~/app/exercises/[exerciseSlug]/guide";
import ExerciseScreen from "~/app/exercises/[exerciseSlug]/index";
import { storage } from "~/lib/mmkv";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { libraryExercise, serveLibrary } from "~/test-utils/fake-library";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

const mockSlug = { current: "bench-press" };

// The header as its title. Top-level (and `mock`-prefixed, so the factory may
// use it) because the React Compiler rewrites components declared inside a
// `jest.mock` factory.
const MockHeader = ({ options }: { options: { title?: string } }) =>
  options.title ? <Text>{options.title}</Text> : null;

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  Stack: {
    Screen: (props: { options: { title?: string } }) => (
      <MockHeader {...props} />
    ),
  },
  useLocalSearchParams: () => ({ exerciseSlug: mockSlug.current }),
}));
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);
jest.mock("~/components/ui/picker", () =>
  jest.requireActual("~/test-utils/picker-stub")
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
  ]);
  setDeviceLanguages(["uk-UA"]);
});

describe("the Library tab in Ukrainian", () => {
  it("titles the tab, the search and the muscle group filter in Ukrainian", async () => {
    await renderInUkrainian(LibraryScreen);

    expect(screen.getByText("Бібліотека")).toBeTruthy();
    expect(screen.getByPlaceholderText("Пошук вправ")).toBeTruthy();
    expect(screen.getByLabelText("Пошук вправ")).toBeTruthy();
    expect(screen.getByLabelText("Група м’язів Усі")).toBeTruthy();
    expect(screen.getByLabelText("Група м’язів Груди")).toBeTruthy();
    expect(screen.getByText("Жим лежачи")).toBeTruthy();
  });

  it("names each row's Muscle groups in Ukrainian", async () => {
    await renderInUkrainian(LibraryScreen);

    expect(screen.getByText("Груди, Трицепс")).toBeTruthy();
  });

  it("opens the Exercise's screen from its row", async () => {
    await renderInUkrainian(LibraryScreen);

    await fireEvent.press(screen.getByText("Жим лежачи"));

    expect(router.push).toHaveBeenCalledWith("/exercises/bench-press");
  });

  it("says no Exercise matches, and offers them all, in Ukrainian", async () => {
    await renderInUkrainian(LibraryScreen);

    await fireEvent.press(screen.getByLabelText("Група м’язів Квадрицепс"));
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
