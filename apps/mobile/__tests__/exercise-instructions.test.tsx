/**
 * The steps on the Exercise detail screen (FIT-630, FIT-755): the Library
 * answers them as a list, which the screen shows as numbered steps, in the
 * App language.
 *
 * The real screen on the fake Public API's Exercise routes.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react-native";

import ExerciseScreen from "~/app/exercises/[exerciseSlug]/index";
import { InstructionSteps } from "~/components/exercises/instruction-steps";
import { storage } from "~/lib/mmkv";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import { fakeExercise, serveExercises } from "~/test-utils/fake-exercises";
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

const TRANSLATED = fakeExercise("dumbbell-bench-press", {
  translations: {
    uk: {
      name: "Жим гантелей лежачи",
      short_description: "Про жим гантелей лежачи.",
      steps: ["Лягайте на лаву.", "Вичавіть гантелі."],
    },
  },
});

/** With its English steps, which `fakeExercise` makes from the name alone. */
const BENCH_PRESS = {
  ...TRANSLATED,
  locales: {
    ...TRANSLATED.locales,
    en: {
      ...TRANSLATED.locales.en,
      steps: [
        "Lie on the bench.",
        "Press the dumbbells up.",
        "Lower them slowly.",
      ],
    },
  },
};

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
  serveExercises([BENCH_PRESS]);
});

describe("an Exercise's instructions", () => {
  it("shows them as numbered steps, in order", async () => {
    await renderScreen();

    expect(shownSteps()).toEqual([
      "1 Lie on the bench.",
      "2 Press the dumbbells up.",
      "3 Lower them slowly.",
    ]);
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
  });
});

describe("InstructionSteps", () => {
  it("shows a step repeated as often as it comes", async () => {
    await render(<InstructionSteps steps={["Press.", "Repeat.", "Repeat."]} />);

    expect(shownSteps()).toEqual(["1 Press.", "2 Repeat.", "3 Repeat."]);
  });

  it("renders nothing for no steps", async () => {
    await render(<InstructionSteps steps={[]} />);

    expect(screen.queryByTestId("instruction-steps")).toBeNull();
  });
});
