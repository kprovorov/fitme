/**
 * The instructions on the Exercise detail screen (FIT-630): the Library
 * writes them as a markdown list, which the screen shows as numbered steps,
 * never with the `- ` or `1. ` markers, in the App language.
 *
 * The real screen on the fake Library.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react-native";

import ExerciseScreen from "~/app/exercises/[exerciseSlug]/index";
import { instructionSteps } from "~/lib/instruction-steps";
import { storage } from "~/lib/mmkv";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { libraryExercise, serveLibrary } from "~/test-utils/fake-library";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

const params: { current: Record<string, string> } = { current: {} };

jest.mock("expo-router", () => {
  const stub = jest.requireActual<typeof import("~/test-utils/router-stub")>(
    "~/test-utils/router-stub"
  );

  return {
    Stack: { Screen: stub.StackScreenStub },
    useLocalSearchParams: () => params.current,
    useRouter: () => stub.stubRouter,
  };
});

jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

jest.mock("~/components/exercises/exercise-video", () => () => null);

jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

const BENCH_PRESS = libraryExercise("dumbbell-bench-press", {
  instructions:
    "- Lie on the bench.\n- Press the dumbbells up.\n\n- Lower them slowly.",
  translations: {
    uk: {
      description: "Про жим гантелей лежачи.",
      instructions: "1. Лягайте на лаву.\n2. Вичавіть гантелі.",
      name: "Жим гантелей лежачи",
    },
  },
});

const renderScreen = async () => {
  params.current = { exerciseSlug: "dumbbell-bench-press" };
  const client = createTestQueryClient();
  await render(
    <QueryClientProvider client={client}>
      <InAppLanguage>
        <ExerciseScreen />
      </InAppLanguage>
    </QueryClientProvider>
  );
  await settle(client);
};

/** Each step row's number and text, in the order they're drawn. */
const shownSteps = () =>
  within(screen.getByTestId("instruction-steps"))
    .getAllByTestId("instruction-step")
    .map((row) =>
      within(row)
        .getAllByText(/\S/u)
        .map((text) => String(text.props.children))
        .join(" ")
    );

beforeEach(() => {
  storage.clearAll();
  serveLibrary([BENCH_PRESS]);
});

describe("an Exercise's instructions", () => {
  it("shows the markdown list as numbered steps, with no markers", async () => {
    await renderScreen();

    expect(shownSteps()).toEqual([
      "1 Lie on the bench.",
      "2 Press the dumbbells up.",
      "3 Lower them slowly.",
    ]);
    expect(screen.queryByText(/^\s*(?:-|\d+\.)\s/u)).toBeNull();
  });

  it("reads each step to VoiceOver once, with its number", async () => {
    await renderScreen();

    expect(
      screen
        .getAllByTestId("instruction-step")
        .map((row) => row.props.accessibilityLabel)
    ).toEqual([
      "1. Lie on the bench.",
      "2. Press the dumbbells up.",
      "3. Lower them slowly.",
    ]);
  });

  it("shows them in the App language", async () => {
    setDeviceLanguages(["uk-UA"]);

    await renderScreen();

    expect(shownSteps()).toEqual(["1 Лягайте на лаву.", "2 Вичавіть гантелі."]);
    expect(screen.queryByText(/^\s*(?:-|\d+\.)\s/u)).toBeNull();
  });
});

describe("instructionSteps", () => {
  it("drops every list marker and blank line", () => {
    expect(instructionSteps("- a\n* b\n• c\n1. d\n2) e\n\n   \nf")).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
    ]);
  });

  it("answers no steps for no instructions", () => {
    expect(instructionSteps("")).toEqual([]);
  });
});
