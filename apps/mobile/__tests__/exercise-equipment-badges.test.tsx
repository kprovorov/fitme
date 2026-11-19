/**
 * The Equipment badges on the Exercise detail screen (FIT-606): once the
 * Exercise in full has loaded, the Equipment it needs shows as a row of
 * badges under the clip, in the order the Library answers (core's), named in
 * the App language. Content the Library hasn't tagged shows no row.
 *
 * The real screen on the fake Public API's Exercise routes, and on the MMKV
 * copy alone for a device that can't reach them, which is also the only way an
 * Equipment id this build doesn't know arrives (the fake, like the API,
 * answers core's list only).
 */
import type { Equipment } from "@fitme/core";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react-native";

import ExerciseScreen from "~/app/exercises/[exerciseSlug]/index";
import type { Exercise } from "~/lib/exercises";
import { writeCachedExercise } from "~/lib/library-cache";
import { storage } from "~/lib/mmkv";
import { setDeviceLanguages } from "~/test-utils/device-locales";
import {
  EXERCISES_UNAVAILABLE,
  failExercises,
  fakeExercise,
  serveExercises,
} from "~/test-utils/fake-exercises";
import { fakePublicApi } from "~/test-utils/fake-public-api";
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

// The clip is native; the badges sit under it.
jest.mock("~/components/exercises/exercise-video", () => () => null);

jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

/** Tagged with two pieces of Equipment, given out of core's order. */
const BENCH_PRESS = fakeExercise("bench-press", {
  equipment: ["bench", "barbell"],
  name: "Bench Press",
  translations: {
    uk: {
      name: "Жим лежачи",
      short_description: "Про жим лежачи.",
      steps: ["Лягайте."],
    },
  },
});

/** Tagged with Equipment only the new Library's list has. */
const BANDED_SWING = fakeExercise("banded-kettlebell-swing", {
  equipment: ["band", "kettlebell"],
  name: "Banded Kettlebell Swing",
});

/** Content the Library hasn't tagged yet. */
const UNTAGGED = fakeExercise("good-morning", {
  equipment: [],
  name: "Good Morning",
});

/** Bench Press in full, as `GET /v1/exercises/bench-press` answers it in English. */
const BENCH_PRESS_IN_FULL: Exercise = {
  benefits: [],
  common_mistakes: [],
  difficulty: "beginner",
  equipment: ["barbell", "bench"],
  long_description: "How to do Bench Press",
  movement_patterns: ["push"],
  muscle_groups: ["chest"],
  name: "Bench Press",
  secondary_muscle_groups: [],
  short_description: "About Bench Press",
  slug: "bench-press",
  steps: ["Do Bench Press"],
  thumbnail_url: "https://media.test/render/bench-press.webp",
  video_url: "https://media.test/bench-press.mp4",
};

/** Older than the hour a kept Exercise stays fresh for. */
const STALE_MS = 2 * 60 * 60 * 1000;

let client: QueryClient;

const renderScreen = async (exerciseSlug: string) => {
  params.current = { exerciseSlug };
  client = createTestQueryClient();
  await render(
    <QueryClientProvider client={client}>
      <InAppLanguage>
        <ExerciseScreen />
      </InAppLanguage>
    </QueryClientProvider>
  );
  await settle(client);
};

/** The badge labels in the row, in the order they're drawn. */
const shownEquipment = () =>
  within(screen.getByTestId("equipment-badges"))
    .getAllByText(/\S/u)
    .map((label) => label.props.children);

beforeEach(() => {
  storage.clearAll();
  serveExercises([BENCH_PRESS, BANDED_SWING, UNTAGGED]);
});

describe("an Exercise's Equipment", () => {
  it("shows one badge per piece, in core's order", async () => {
    await renderScreen("bench-press");

    expect(shownEquipment()).toEqual(["Barbell", "Bench"]);
  });

  it("shows no row at all for an Exercise the content hasn't tagged", async () => {
    await renderScreen("good-morning");

    // The screen itself is there: it's only the row that isn't.
    expect(screen.getByText("About Good Morning")).toBeTruthy();
    expect(screen.queryByTestId("equipment-badges")).toBeNull();
  });

  it("names each piece in the App language", async () => {
    setDeviceLanguages(["uk-UA"]);

    await renderScreen("bench-press");

    expect(screen.getByText("Про жим лежачи.")).toBeTruthy();
    expect(shownEquipment()).toEqual(["Штанга", "Лава"]);
  });

  it.each([
    ["en-US", ["Kettlebell", "Resistance band"]],
    ["uk-UA", ["Гиря", "Еспандер-стрічка"]],
  ])(
    "names Equipment only the new list has (%s)",
    async (deviceLanguage, names) => {
      setDeviceLanguages([deviceLanguage]);

      await renderScreen("banded-kettlebell-swing");

      expect(shownEquipment()).toEqual(names);
    }
  );
});

/**
 * Keeps the Exercise on the device as the Library answered it (Equipment in
 * core's order), then takes the Library away: what the Screen shows is the
 * copy alone.
 */
const keptOnDevice = (exercise: Exercise) => {
  // Saved long enough ago to be stale, so the screen does ask the Library
  // again: what it shows is the copy surviving that failure, not a copy the
  // query never looked past.
  writeCachedExercise("en", exercise, { savedAt: Date.now() - STALE_MS });
  failExercises(EXERCISES_UNAVAILABLE);
};

describe("an Exercise read offline, from the copy kept on the device", () => {
  it("shows its Equipment, the Library unreachable", async () => {
    keptOnDevice(BENCH_PRESS_IN_FULL);

    await renderScreen("bench-press");

    expect(shownEquipment()).toEqual(["Barbell", "Bench"]);
  });

  it("shows an Equipment id this build doesn't know as itself", async () => {
    // A piece of Equipment the Library added after this build: the SDK passes
    // an id it doesn't know through, and so does the copy kept of it. The
    // fake, like the API, answers core's own list only.
    keptOnDevice({
      ...BENCH_PRESS_IN_FULL,
      equipment: ["barbell", "sandbag" as Equipment],
    });

    await renderScreen("bench-press");

    expect(shownEquipment()).toEqual(["Barbell", "sandbag"]);
  });
});

describe("a copy kept by a build reading the Legacy Library", () => {
  it("is swept, and the screen reads the Exercise from the new route", async () => {
    // The Legacy Library's shape, under its key: no Equipment, no steps.
    storage.set(
      "library.en.exercise.bench-press",
      JSON.stringify({
        savedAt: Date.now(),
        value: {
          description: "About bench-press.",
          instructions: "- Do bench-press.",
          muscle_groups: ["chest"],
          name: "Bench Press",
          slug: "bench-press",
          thumbnail_url: "https://media.test/render/bench-press.jpg",
          video_url: "https://media.test/bench-press.mp4",
        },
      })
    );

    await renderScreen("bench-press");

    expect(
      storage.getString("library.en.exercise.bench-press")
    ).toBeUndefined();
    expect(fakePublicApi.count("GET /v1/exercises/{slug}")).toBe(1);
    expect(screen.getByText("About Bench Press")).toBeTruthy();
    expect(shownEquipment()).toEqual(["Barbell", "Bench"]);
  });
});

describe("a copy of an Exercise the device can't read", () => {
  it("counts as no copy at all, rather than breaking the screen", async () => {
    // `equipment` saved as something that isn't a list of ids: the schema
    // behind `readCachedExercise` rejects the whole copy, so the screen asks
    // the Library instead of mapping over it.
    writeCachedExercise("en", {
      ...BENCH_PRESS_IN_FULL,
      // SAFETY: the one shape the typed API can't write, which is the point:
      // only a corrupted copy holds an `equipment` that isn't a list of ids.
      equipment: "barbell" as never,
    });

    await renderScreen("bench-press");

    // Answered by the Library, which has it tagged in core's order.
    expect(shownEquipment()).toEqual(["Barbell", "Bench"]);
  });
});
