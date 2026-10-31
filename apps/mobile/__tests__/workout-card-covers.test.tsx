/**
 * The Workout cards' Covers on the mounted-screen seam: the real Workout tab
 * with Supabase swapped for the in-memory backend and the Library for its
 * fake, which serves Covers (all from `test-utils/`).
 */

import type { Cover } from "@fitme/library-sdk";
import { LibraryUnavailableError } from "@fitme/library-sdk";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Dimensions, PixelRatio } from "react-native";
import HomeScreen from "~/app/(tabs)/(home)/index";
import { writeCachedCovers } from "~/lib/library-cache";
import { storage } from "~/lib/mmkv";
import {
  library,
  libraryExercise,
  serveLibrary,
} from "~/test-utils/fake-library";
import { FAKE_USER_ID } from "~/test-utils/fake-public-api";
import { backend } from "~/test-utils/fake-workout-backend";
import {
  createTestQueryClient,
  settle,
  until,
} from "~/test-utils/query-client";

jest.mock("expo-router", () => ({
  Link: ({ children }: { children: unknown }) => children,
  Stack: { Screen: () => null },
  useNavigation: () => ({}),
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: () => true,
    dismiss: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ isLoaded: true, user: { id: "user-1" } }),
}));

jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: { invalidateCustomerInfoCache: () => Promise.resolve() },
}));

jest.mock("~/lib/supabase", () => ({
  supabase: jest.requireActual<
    typeof import("~/test-utils/fake-workout-backend")
  >("~/test-utils/fake-workout-backend").fakeSupabase,
}));

// The real Clerk SDK (reached through the Workout cards) opens a MessagePort
// at import that keeps Jest alive.
jest.mock("~/lib/clerk", () => ({
  getCurrentUserId: () =>
    jest.requireActual<typeof import("~/test-utils/fake-public-api")>(
      "~/test-utils/fake-public-api"
    ).FAKE_USER_ID,
}));

jest.mock("~/lib/segment", () => ({ segmentClient: { track: jest.fn() } }));
jest.mock("~/components/symbol-image", () => ({ SymbolImage: () => null }));
jest.mock("~/components/ui/dropdown-menu", () =>
  jest.requireActual("~/test-utils/dropdown-menu-stub")
);
jest.mock("~/components/ui/button", () =>
  jest.requireActual("~/test-utils/button-stub")
);

const RENDER_URL = "https://media.test/storage/v1/render/image/public/";

const LEGS_COVER: Cover = {
  id: "3f2b8a4e-6c1d-4e5f-9a7b-1c2d3e4f5a6b",
  image_url: `${RENDER_URL}exercise-media/covers/legs.jpg`,
  muscle_groups: ["quadriceps"],
};

const CHEST_COVER: Cover = {
  id: "9c8d7e6f-5a4b-4c3d-8e2f-1a0b9c8d7e6f",
  image_url: `${RENDER_URL}exercise-media/covers/chest.jpg`,
  muscle_groups: ["chest"],
};

const UNKNOWN_COVER_ID = "00000000-0000-4000-8000-000000000000";

let queryClient = createTestQueryClient();

const renderScreen = async () => {
  queryClient = createTestQueryClient();
  await render(
    <QueryClientProvider client={queryClient}>
      <HomeScreen />
    </QueryClientProvider>
  );
};

const mount = async () => {
  await renderScreen();
  await settle(queryClient);
};

/** A card's Cover image, hidden from assistive tech like the rest of its background. */
const coverOf = (workoutId: string) =>
  screen.queryByTestId(`workout-cover-${workoutId}`, {
    includeHiddenElements: true,
  });

// expo-image's native view gets its source as a list.
const coverUri = (workoutId: string) =>
  (coverOf(workoutId)?.props.source as Array<{ uri?: string }> | undefined)?.[0]
    ?.uri;

beforeEach(() => {
  jest.clearAllMocks();
  storage.clearAll();
  backend.reset();
  backend.seedProfile(FAKE_USER_ID);
  serveLibrary(
    [
      libraryExercise("squat", { muscle_groups: ["quadriceps"] }),
      libraryExercise("bench-press", { muscle_groups: ["chest"] }),
    ],
    { covers: [LEGS_COVER, CHEST_COVER] }
  );
  backend.seedPlan({
    id: "plan-1",
    is_active: true,
    name: "Strength",
    workouts: [
      {
        cover: LEGS_COVER.id,
        exercises: [{ sets: 3, slug: "squat" }],
        id: "workout-legs",
        name: "Legs",
      },
      {
        cover: UNKNOWN_COVER_ID,
        exercises: [{ sets: 3, slug: "bench-press" }],
        id: "workout-push",
        name: "Push",
      },
      {
        cover: null,
        exercises: [{ sets: 3, slug: "squat" }],
        id: "workout-pull",
        name: "Pull",
      },
    ],
  });
});

describe("The Workout cards' Covers", () => {
  it("shows a known Cover behind its card, sized for the card in device pixels", async () => {
    await mount();

    // The card is the window's width less its `sm` inset on each side, and
    // 400 points tall.
    const pixels = PixelRatio.getPixelSizeForLayoutSize;
    const cardWidth = Dimensions.get("window").width - 2 * 16;
    expect(coverUri("workout-legs")).toBe(
      `${LEGS_COVER.image_url}?width=${pixels(cardWidth)}&height=${pixels(400)}`
    );
    expect(coverOf("workout-legs")?.props.style).toEqual(
      expect.objectContaining({ opacity: 0.8 })
    );
  });

  it("keeps a card black for a Cover id the Library doesn't have", async () => {
    await mount();

    expect(screen.getByTestId("workout-card-workout-push")).toBeTruthy();
    expect(coverOf("workout-push")).toBeNull();
  });

  it("keeps a card black for a Workout without a Cover", async () => {
    await mount();

    expect(screen.getByTestId("workout-card-workout-pull")).toBeTruthy();
    expect(coverOf("workout-pull")).toBeNull();
  });

  it("keeps a card black once its Cover fails to load", async () => {
    await mount();

    const cover = coverOf("workout-legs");
    expect(cover).not.toBeNull();
    await act(() => {
      if (cover) {
        fireEvent(cover, "error", { nativeEvent: { error: "404" } });
      }
    });

    expect(coverOf("workout-legs")).toBeNull();
  });

  it("shows the cached Covers while the Library fails", async () => {
    writeCachedCovers([LEGS_COVER], Date.now() - 2 * 60 * 60 * 1000);
    serveLibrary([]).failWith(new LibraryUnavailableError());

    await mount();

    expect(coverUri("workout-legs")).toContain(LEGS_COVER.image_url);
    expect(coverOf("workout-push")).toBeNull();
  });

  it("shows every card black when the Library fails with nothing cached", async () => {
    serveLibrary([]).failWith(new LibraryUnavailableError());

    await mount();

    expect(screen.getByTestId("workout-card-workout-legs")).toBeTruthy();
    expect(coverOf("workout-legs")).toBeNull();
    expect(coverOf("workout-push")).toBeNull();
    expect(coverOf("workout-pull")).toBeNull();
  });

  it("caches the Covers it reads, for the next launch", async () => {
    await mount();

    // A new launch, offline: the Covers come from MMKV.
    serveLibrary([]).failWith(new LibraryUnavailableError());
    await mount();

    expect(coverUri("workout-legs")).toContain(LEGS_COVER.image_url);
  });

  it("shows the cards before the Covers arrive", async () => {
    let answer: (covers: Cover[]) => void = () => undefined;
    const fake = serveLibrary([
      libraryExercise("squat", { muscle_groups: ["quadriceps"] }),
    ]);
    library.current = {
      ...fake,
      covers: () =>
        new Promise<Cover[]>((resolve) => {
          answer = resolve;
        }),
    };

    await renderScreen();
    await until(
      () => screen.queryByTestId("workout-card-workout-legs") !== null
    );

    expect(screen.getByTestId("workout-card-workout-legs")).toBeTruthy();
    expect(coverOf("workout-legs")).toBeNull();

    await act(() => answer([LEGS_COVER]));
    await settle(queryClient);

    expect(coverUri("workout-legs")).toContain(LEGS_COVER.image_url);
  });
});
