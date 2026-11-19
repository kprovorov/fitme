/**
 * The redesigned Exercise detail screen and its guide (FIT-758, Figma's
 * Exercise Detail and Exercise Guide frames, FIT-737): the detail shows the
 * clip, the Equipment, Difficulty and movement-pattern badges, the short
 * description, How to Do It, the primary then secondary muscle groups, the
 * long description and the benefits; the guide the numbered steps, then the
 * common mistakes. A section with nothing to show has no heading.
 *
 * The real screens on the fake Public API's Exercise routes, in English and
 * Ukrainian, and on the MMKV copy alone for a device that can't reach them.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";
import type { ReactElement } from "react";

import ExerciseGuideScreen from "~/app/exercises/[exerciseSlug]/guide";
import ExerciseScreen from "~/app/exercises/[exerciseSlug]/index";
import type { Exercise } from "~/lib/exercises";
import { writeCachedExercise } from "~/lib/library-cache";
import { storage } from "~/lib/mmkv";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import {
  EXERCISES_UNAVAILABLE,
  exercisesRateLimited,
  failExercises,
  fakeExercise,
  serveExercises,
} from "~/test-utils/fake-exercises";
import type { FakeExerciseOptions } from "~/test-utils/fake-exercises";
import { fakePublicApi } from "~/test-utils/fake-public-api";
import { InAppLanguage } from "~/test-utils/in-app-language";
import { createTestQueryClient, settle } from "~/test-utils/query-client";
import {
  dismissedToRoute,
  pushedRoutes,
  resetStubRouter,
} from "~/test-utils/router-stub";

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

// The clip is native; the screen around it is what's tested.
jest.mock("~/components/exercises/exercise-video", () => () => null);

jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

const ENGLISH = {
  benefits: ["Builds chest and triceps strength.", "Evens out each side."],
  common_mistakes: ["Flaring the elbows.", "Bouncing off the chest."],
  long_description: "Pressing two dumbbells lets each arm work on its own.",
  name: "Dumbbell Bench Press",
  short_description: "A flat-bench press with a dumbbell in each hand.",
  steps: ["Lie on the bench.", "Press the dumbbells up."],
};

/** An Exercise with its English text set, beyond what `fakeExercise` makes. */
const exerciseWith = (
  slug: string,
  english: Partial<typeof ENGLISH> & { name: string },
  options: FakeExerciseOptions = {}
) => {
  const exercise = fakeExercise(slug, { ...options, name: english.name });

  return {
    ...exercise,
    locales: {
      ...exercise.locales,
      en: { ...exercise.locales.en, ...english },
    },
  };
};

const BENCH_PRESS = exerciseWith("dumbbell-bench-press", ENGLISH, {
  difficulty: "intermediate",
  equipment: ["bench", "dumbbell"],
  movement_patterns: ["push"],
  muscle_groups: ["chest"],
  secondary_muscle_groups: ["triceps", "shoulders"],
  translations: {
    uk: {
      benefits: ["Розвиває силу грудей і трицепсів."],
      common_mistakes: ["Розводити лікті в сторони."],
      long_description: "Дві гантелі дають кожній руці працювати окремо.",
      name: "Жим гантелей лежачи",
      short_description: "Жим на рівній лаві з гантеллю в кожній руці.",
      steps: ["Лягайте на лаву.", "Вичавіть гантелі."],
    },
  },
});

/** No secondary muscle group, no benefits and no common mistakes. */
const PLANK = exerciseWith(
  "plank",
  { benefits: [], common_mistakes: [], name: "Plank" },
  {
    difficulty: "beginner",
    equipment: ["bodyweight"],
    movement_patterns: ["core"],
    muscle_groups: ["core"],
    secondary_muscle_groups: [],
  }
);

/** No steps and no common mistakes: nothing for its guide to show. */
const NO_GUIDE = exerciseWith("no-guide", {
  common_mistakes: [],
  name: "No Guide",
  steps: [],
});

/** Older than the hour a kept Exercise stays fresh for. */
const STALE_MS = 2 * 60 * 60 * 1000;

const renderWith = async (
  screenElement: ReactElement,
  exerciseSlug: string
) => {
  params.current = { exerciseSlug };
  const client = createTestQueryClient();
  await render(
    <QueryClientProvider client={client}>
      <InAppLanguage>{screenElement}</InAppLanguage>
    </QueryClientProvider>
  );
  await settle(client);

  return client;
};

const renderDetail = (exerciseSlug: string) =>
  renderWith(<ExerciseScreen />, exerciseSlug);

const renderGuide = (exerciseSlug: string) =>
  renderWith(<ExerciseGuideScreen />, exerciseSlug);

/** Every text in the badge with this testID, in the order drawn. */
const badgeLabels = (testID: string) =>
  screen
    .queryAllByTestId(testID)
    .map((badge) => String(badge.props.accessibilityLabel));

/** The texts in an element, in the order drawn. */
const textsIn = (testID: string) =>
  within(screen.getByTestId(testID))
    .getAllByText(/\S/u)
    .map((node) => node.props.children);

interface JsonNode {
  children?: (JsonNode | string)[] | null;
  props?: { testID?: string };
}

/** The testIDs drawn, in the order they're drawn (depth first). */
const drawnTestIDs = (): string[] => {
  const ids: string[] = [];

  const walk = (node: JsonNode | string | null) => {
    if (node === null || typeof node === "string") {
      return;
    }

    if (node.props?.testID) {
      ids.push(node.props.testID);
    }

    for (const child of node.children ?? []) {
      walk(child);
    }
  };

  const tree = screen.toJSON() as JsonNode | JsonNode[] | null;

  for (const node of Array.isArray(tree) ? tree : [tree]) {
    walk(node);
  }

  return ids;
};

/** `testIDs` as drawn: in the order given when the screen draws them so. */
const inDrawnOrder = (testIDs: readonly string[]) =>
  drawnTestIDs().filter((id) => testIDs.includes(id));

beforeEach(() => {
  storage.clearAll();
  resetStubRouter();
  serveExercises([BENCH_PRESS, PLANK, NO_GUIDE], {
    replacedSlugs: { "flat-dumbbell-press": "dumbbell-bench-press" },
  });
});

describe("the Exercise detail screen", () => {
  it("shows every section, top to bottom, in English", async () => {
    await renderDetail("dumbbell-bench-press");

    expect(screen.getByTestId("exercise-clip").props.accessibilityLabel).toBe(
      "Dumbbell Bench Press clip"
    );
    expect(screen.getByText("Dumbbell Bench Press")).toBeTruthy();
    expect(badgeLabels("equipment-badge")).toEqual([
      "Equipment: Dumbbell",
      "Equipment: Bench",
    ]);
    expect(badgeLabels("difficulty-badge")).toEqual([
      "Difficulty: Intermediate",
    ]);
    expect(badgeLabels("movement-pattern-badge")).toEqual([
      "Movement pattern: Push",
    ]);
    expect(screen.getByText(ENGLISH.short_description)).toBeTruthy();
    expect(screen.getByRole("button", { name: "How to Do It" })).toBeTruthy();
    expect(
      screen.getByTestId("primary-muscle-groups").props.accessibilityLabel
    ).toBe("Primary muscle groups: Chest");
    expect(
      screen.getByTestId("secondary-muscle-groups").props.accessibilityLabel
    ).toBe("Secondary muscle groups: Triceps, Shoulders");
    expect(screen.getByText(ENGLISH.long_description)).toBeTruthy();
    expect(textsIn("exercise-benefits")).toEqual([
      "Benefits",
      ...ENGLISH.benefits,
    ]);

    // In the frame's order.
    const sections = [
      "exercise-clip",
      "exercise-badges",
      "exercise-short-description",
      "muscle-groups",
      "exercise-long-description",
      "exercise-benefits",
    ];

    expect(inDrawnOrder(sections)).toEqual(sections);

    // Use cases and tags never show, and the steps are the guide's.
    expect(screen.queryByTestId("instruction-steps")).toBeNull();
    // The content names the Exercise, so the header doesn't.
    expect(
      screen.queryByRole("header", { name: "Dumbbell Bench Press" })
    ).toBeNull();
  });

  it("shows every section in Ukrainian", async () => {
    setDeviceLanguages(["uk-UA"]);

    await renderDetail("dumbbell-bench-press");

    expect(screen.getByText("Жим гантелей лежачи")).toBeTruthy();
    expect(badgeLabels("equipment-badge")).toEqual([
      "Обладнання: Гантель",
      "Обладнання: Лава",
    ]);
    expect(badgeLabels("difficulty-badge")).toEqual([
      "Складність: Середній рівень",
    ]);
    expect(badgeLabels("movement-pattern-badge")).toEqual(["Тип руху: Жим"]);
    expect(
      screen.getByText("Жим на рівній лаві з гантеллю в кожній руці.")
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Як виконувати" })).toBeTruthy();
    expect(screen.getByText("Групи м’язів")).toBeTruthy();
    expect(screen.getByText("Основні")).toBeTruthy();
    expect(screen.getByText("Допоміжні")).toBeTruthy();
    expect(
      screen.getByText("Дві гантелі дають кожній руці працювати окремо.")
    ).toBeTruthy();
    expect(textsIn("exercise-benefits")).toEqual([
      "Переваги",
      "Розвиває силу грудей і трицепсів.",
    ]);
  });

  it.each([
    ["en-US", "Muscle Groups", "Secondary", "Benefits"],
    ["uk-UA", "Групи м’язів", "Допоміжні", "Переваги"],
  ])(
    "leaves out the secondary muscle groups and benefits an Exercise hasn't got (%s)",
    async (deviceLanguage, muscleGroups, secondary, benefits) => {
      setDeviceLanguages([deviceLanguage]);

      await renderDetail("plank");

      expect(screen.getByText(muscleGroups)).toBeTruthy();
      expect(screen.getByTestId("primary-muscle-groups")).toBeTruthy();
      expect(screen.queryByTestId("secondary-muscle-groups")).toBeNull();
      expect(screen.queryByText(secondary)).toBeNull();
      expect(screen.queryByTestId("exercise-benefits")).toBeNull();
      expect(screen.queryByText(benefits)).toBeNull();
    }
  );

  it("opens the guide from How to Do It", async () => {
    await renderDetail("dumbbell-bench-press");

    await fireEvent.press(screen.getByRole("button", { name: "How to Do It" }));

    expect(pushedRoutes().map(({ pathname }) => pathname)).toEqual([
      "/exercises/dumbbell-bench-press/guide",
    ]);
  });
});

describe("an old slug", () => {
  it("opens the Exercise replacing it, and that Exercise's guide", async () => {
    await renderDetail("flat-dumbbell-press");

    expect(screen.getByText("Dumbbell Bench Press")).toBeTruthy();
    expect(badgeLabels("difficulty-badge")).toEqual([
      "Difficulty: Intermediate",
    ]);

    await fireEvent.press(screen.getByRole("button", { name: "How to Do It" }));

    expect(pushedRoutes().map(({ pathname }) => pathname)).toEqual([
      "/exercises/dumbbell-bench-press/guide",
    ]);
  });
});

describe("the guide", () => {
  it.each([
    [
      "en-US",
      "Steps",
      ["Step 1: Lie on the bench.", "Step 2: Press the dumbbells up."],
      ["Common Mistakes", ...ENGLISH.common_mistakes],
    ],
    [
      "uk-UA",
      "Кроки",
      ["Крок 1: Лягайте на лаву.", "Крок 2: Вичавіть гантелі."],
      ["Типові помилки", "Розводити лікті в сторони."],
    ],
  ])(
    "shows the numbered steps, then the common mistakes (%s)",
    async (deviceLanguage, steps, stepLabels, mistakes) => {
      setDeviceLanguages([deviceLanguage]);

      await renderGuide("dumbbell-bench-press");

      expect(screen.getByText(steps)).toBeTruthy();
      expect(
        screen
          .getAllByTestId("instruction-step")
          .map((row) => row.props.accessibilityLabel)
      ).toEqual(stepLabels);
      expect(textsIn("exercise-common-mistakes")).toEqual(mistakes);

      expect(
        inDrawnOrder(["instruction-steps", "exercise-common-mistakes"])
      ).toEqual(["instruction-steps", "exercise-common-mistakes"]);

      // The guide is steps and mistakes only.
      expect(screen.queryByTestId("exercise-benefits")).toBeNull();
    }
  );

  it("leaves out the common mistakes an Exercise hasn't got", async () => {
    await renderGuide("plank");

    expect(screen.getByText("Steps")).toBeTruthy();
    expect(screen.queryByTestId("exercise-common-mistakes")).toBeNull();
    expect(screen.queryByText("Common Mistakes")).toBeNull();
  });

  it.each([
    ["en-US", "No guide yet", "This exercise doesn't have steps yet."],
    ["uk-UA", "Інструкції ще немає", "Для цієї вправи ще немає кроків."],
  ])(
    "says so for an Exercise with nothing to guide through (%s)",
    async (deviceLanguage, title, message) => {
      setDeviceLanguages([deviceLanguage]);

      await renderGuide("no-guide");

      expect(screen.getByText(title)).toBeTruthy();
      expect(screen.getByText(message)).toBeTruthy();
    }
  );

  it("opens on an old slug as the Exercise replacing it", async () => {
    await renderGuide("flat-dumbbell-press");

    expect(screen.getByText("Lie on the bench.")).toBeTruthy();
  });
});

/**
 * Keeps the Exercise on the device as the Library answered it, then takes the
 * Library away: what the Screen shows is the copy alone.
 */
const keptOnDevice = (exercise: Exercise) => {
  writeCachedExercise("en", exercise, { savedAt: Date.now() - STALE_MS });
  failExercises(EXERCISES_UNAVAILABLE);
};

const BENCH_PRESS_IN_FULL: Exercise = {
  benefits: ENGLISH.benefits,
  common_mistakes: ENGLISH.common_mistakes,
  difficulty: "intermediate",
  equipment: ["bench", "dumbbell"],
  long_description: ENGLISH.long_description,
  movement_patterns: ["push"],
  muscle_groups: ["chest"],
  name: ENGLISH.name,
  secondary_muscle_groups: ["triceps"],
  short_description: ENGLISH.short_description,
  slug: "dumbbell-bench-press",
  steps: ENGLISH.steps,
  thumbnail_url: "https://media.test/render/dumbbell-bench-press.webp",
  video_url: "https://media.test/dumbbell-bench-press.mp4",
};

describe("an Exercise read offline, from the copy kept on the device", () => {
  it("shows the detail screen in full", async () => {
    keptOnDevice(BENCH_PRESS_IN_FULL);

    await renderDetail("dumbbell-bench-press");

    expect(screen.getByText(ENGLISH.short_description)).toBeTruthy();
    expect(badgeLabels("equipment-badge")).toHaveLength(2);
    expect(
      screen.getByTestId("secondary-muscle-groups").props.accessibilityLabel
    ).toBe("Secondary muscle groups: Triceps");
    expect(screen.getByText(ENGLISH.long_description)).toBeTruthy();
    expect(textsIn("exercise-benefits")).toEqual([
      "Benefits",
      ...ENGLISH.benefits,
    ]);
  });

  it("shows the guide in full", async () => {
    keptOnDevice(BENCH_PRESS_IN_FULL);

    await renderGuide("dumbbell-bench-press");

    expect(screen.getAllByTestId("instruction-step")).toHaveLength(2);
    expect(textsIn("exercise-common-mistakes")).toEqual([
      "Common Mistakes",
      ...ENGLISH.common_mistakes,
    ]);
  });

  it("shows the detail screen in Ukrainian from the Ukrainian copy", async () => {
    setDeviceLanguages(["uk-UA"]);
    writeCachedExercise(
      "uk",
      {
        ...BENCH_PRESS_IN_FULL,
        name: "Жим гантелей лежачи",
        short_description: "Жим на рівній лаві з гантеллю в кожній руці.",
      },
      { savedAt: Date.now() - STALE_MS }
    );
    failExercises(EXERCISES_UNAVAILABLE);

    await renderDetail("dumbbell-bench-press");

    expect(screen.getByText("Жим гантелей лежачи")).toBeTruthy();
    expect(
      screen.getByText("Жим на рівній лаві з гантеллю в кожній руці.")
    ).toBeTruthy();
    expect(badgeLabels("difficulty-badge")).toEqual([
      "Складність: Середній рівень",
    ]);
  });

  it("shows a movement pattern this build doesn't know as itself", async () => {
    keptOnDevice({
      ...BENCH_PRESS_IN_FULL,
      // SAFETY: an id the Library added after this build, kept as a string.
      movement_patterns: ["sled_push" as never],
    });

    await renderDetail("dumbbell-bench-press");

    expect(badgeLabels("movement-pattern-badge")).toEqual([
      "Movement pattern: sled_push",
    ]);
  });
});

describe.each([
  ["detail screen", ExerciseScreen],
  ["guide", ExerciseGuideScreen],
])("the %s's states", (_name, Screen) => {
  const renderScreen = (exerciseSlug: string) =>
    renderWith(<Screen />, exerciseSlug);

  it.each([
    ["en-US", "Loading exercise"],
    ["uk-UA", "Завантаження вправи"],
  ])("loads, saying so to VoiceOver (%s)", async (deviceLanguage, loading) => {
    setDeviceLanguages([deviceLanguage]);
    const resume = fakePublicApi.pause("GET /v1/exercises/{slug}");
    params.current = { exerciseSlug: "dumbbell-bench-press" };
    const client = createTestQueryClient();
    await render(
      <QueryClientProvider client={client}>
        <InAppLanguage>
          <Screen />
        </InAppLanguage>
      </QueryClientProvider>
    );

    expect(screen.getByLabelText(loading)).toBeTruthy();

    resume();
    await settle(client);

    expect(screen.queryByLabelText(loading)).toBeNull();
  });

  it.each([
    [
      "en-US",
      "Exercise not found",
      "This exercise isn't in the library any more.",
    ],
    ["uk-UA", "Вправу не знайдено", "Цієї вправи більше немає в бібліотеці."],
  ])(
    "says an Exercise the Library hasn't got isn't found (%s)",
    async (deviceLanguage, title, message) => {
      setDeviceLanguages([deviceLanguage]);

      await renderScreen("not-an-exercise");

      expect(screen.getByText(title)).toBeTruthy();
      expect(screen.getByText(message)).toBeTruthy();
    }
  );

  it.each([
    [
      "en-US",
      "Couldn't load exercise",
      "Check your connection and try again.",
      "Try Again",
    ],
    [
      "uk-UA",
      "Не вдалося завантажити вправу",
      "Перевірте з’єднання і спробуйте ще раз.",
      "Спробувати ще раз",
    ],
  ])(
    "says it couldn't load, and tries again (%s)",
    async (deviceLanguage, title, message, tryAgain) => {
      setDeviceLanguages([deviceLanguage]);
      failExercises(EXERCISES_UNAVAILABLE);

      const client = await renderScreen("dumbbell-bench-press");

      expect(screen.getByText(title)).toBeTruthy();
      expect(screen.getByText(message)).toBeTruthy();

      failExercises(null);
      await fireEvent.press(screen.getByRole("button", { name: tryAgain }));
      await settle(client);

      expect(screen.queryByText(title)).toBeNull();
      expect(
        screen.getAllByTestId(/^(exercise-badges|instruction-step)$/u).length
      ).toBeGreaterThan(0);
    }
  );

  it("gives the wait when rate limited", async () => {
    failExercises(exercisesRateLimited(30));

    await renderScreen("dumbbell-bench-press");

    expect(screen.getByText("Couldn't load exercise")).toBeTruthy();
    expect(screen.getByText(/30/u)).toBeTruthy();
  });
});

describe("the detail screen's not-found state", () => {
  it("goes back to the Library", async () => {
    await renderDetail("not-an-exercise");

    await fireEvent.press(
      screen.getByRole("button", { name: "Back to Library" })
    );

    expect(dismissedToRoute()).toBe("/library");
  });
});
