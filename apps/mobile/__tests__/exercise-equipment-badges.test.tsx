/**
 * The Equipment badges on the Exercise detail screen (FIT-606): once the
 * Exercise in full has loaded, the Equipment it needs shows as a row of
 * badges under the clip, in the order the Library answers (core's), named in
 * the App language. Content the Library hasn't tagged shows no row.
 *
 * The real screen on the fake Library, and on the MMKV copy alone for a
 * device that can't reach the Library, which is also the only way an
 * Equipment id this build doesn't know arrives (the fake, like the API,
 * answers core's list only).
 */
import type { Equipment } from "@fitme/core";
import { LibraryUnavailableError } from "@fitme/library-sdk";
import type { Exercise } from "@fitme/library-sdk";
import type { FakeLibrary } from "@fitme/library-sdk/fake";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react-native";

import ExerciseScreen from "~/app/exercises/[exerciseSlug]/index";
import { writeCachedExercise } from "~/lib/library-cache";
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

// The clip is native; the badges sit under it.
jest.mock("~/components/exercises/exercise-video", () => () => null);

jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));

/** Tagged with two pieces of Equipment, given out of core's order. */
const BENCH_PRESS = libraryExercise("bench-press", {
  equipment: ["bench", "barbell"],
  name: "Bench Press",
  translations: {
    uk: {
      description: "Про жим лежачи.",
      instructions: "- Лягайте.",
      name: "Жим лежачи",
    },
  },
});

/** Content the Library hasn't tagged yet. */
const UNTAGGED = libraryExercise("good-morning", { equipment: [] });

/** Older than the hour a kept Exercise stays fresh for. */
const STALE_MS = 2 * 60 * 60 * 1000;

let client: QueryClient;
let fake: FakeLibrary;

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
  fake = serveLibrary([BENCH_PRESS, UNTAGGED]);
});

describe("an Exercise's Equipment", () => {
  it("shows one badge per piece, in core's order", async () => {
    await renderScreen("bench-press");

    expect(shownEquipment()).toEqual(["Barbell", "Bench"]);
  });

  it("shows no row at all for an Exercise the content hasn't tagged", async () => {
    await renderScreen("good-morning");

    // The screen itself is there: it's only the row that isn't.
    expect(screen.getByText("About good-morning.")).toBeTruthy();
    expect(screen.queryByTestId("equipment-badges")).toBeNull();
  });

  it("names each piece in the App language", async () => {
    setDeviceLanguages(["uk-UA"]);

    await renderScreen("bench-press");

    expect(screen.getByText("Про жим лежачи.")).toBeTruthy();
    expect(shownEquipment()).toEqual(["Штанга", "Лава"]);
  });
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
  writeCachedExercise("en", exercise, Date.now() - STALE_MS);
  fake.failWith(new LibraryUnavailableError());
};

describe("an Exercise read offline, from the copy kept on the device", () => {
  it("shows its Equipment, the Library unreachable", async () => {
    keptOnDevice({ ...BENCH_PRESS, equipment: ["barbell", "bench"] });

    await renderScreen("bench-press");

    expect(shownEquipment()).toEqual(["Barbell", "Bench"]);
  });

  it("shows an Equipment id this build doesn't know as itself", async () => {
    // A piece of Equipment the Library added after this build: the SDK passes
    // an id it doesn't know through, and so does the copy kept of it. The
    // fake, like the API, answers core's own list only.
    keptOnDevice({
      ...BENCH_PRESS,
      equipment: ["barbell", "kettlebell" as Equipment],
    });

    await renderScreen("bench-press");

    expect(shownEquipment()).toEqual(["Barbell", "kettlebell"]);
  });

  it("shows no row for a copy kept before the Library had Equipment", async () => {
    const { equipment: _none, ...beforeEquipment } = BENCH_PRESS;
    // SAFETY: the shape a build from before Equipment wrote, which the schema
    // behind `readCachedExercise` still accepts.
    keptOnDevice(beforeEquipment as Exercise);

    await renderScreen("bench-press");

    expect(screen.getByText("About bench-press.")).toBeTruthy();
    expect(screen.queryByTestId("equipment-badges")).toBeNull();
  });
});

describe("a copy of an Exercise the device can't read", () => {
  it("counts as no copy at all, rather than breaking the screen", async () => {
    // `equipment` saved as something that isn't a list of ids: the schema
    // behind `readCachedExercise` rejects the whole copy, so the screen asks
    // the Library instead of mapping over it.
    writeCachedExercise("en", {
      ...BENCH_PRESS,
      // SAFETY: the one shape the typed API can't write, which is the point:
      // only a corrupted copy holds an `equipment` that isn't a list of ids.
      equipment: "barbell" as never,
    });

    await renderScreen("bench-press");

    // Answered by the Library, which has it tagged in core's order.
    expect(shownEquipment()).toEqual(["Barbell", "Bench"]);
  });
});
