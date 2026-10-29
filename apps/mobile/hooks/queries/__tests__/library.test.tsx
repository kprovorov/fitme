import { createLibrary, LibraryUnavailableError } from "@fitme/library-sdk";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { i18n } from "~/lib/i18n";
import { storage } from "~/lib/mmkv";
import {
  library,
  libraryExercise,
  serveLibrary,
} from "~/test-utils/fake-library";
import { createTestQueryClient } from "~/test-utils/query-client";
import { useExerciseDetailQuery, useExercises } from "../library";

jest.mock(
  "~/lib/library",
  () =>
    jest.requireActual<typeof import("~/test-utils/fake-library")>(
      "~/test-utils/fake-library"
    ).libraryModule
);

/** A fresh query cache, as after a restart of the app. */
const newWrapper = () => {
  const client = createTestQueryClient();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

const SLUGS_PATTERN = /[?&]slugs=([^&]*)/;

beforeEach(() => {
  storage.clearAll();
});

// The App language is the i18n instance's, shared by every test of the file.
afterEach(async () => {
  await i18n.changeLanguage("en");
});

const BENCH_PRESS_UK = {
  description: "Про жим лежачи.",
  instructions: "- Жміть.",
  name: "Жим лежачи",
};

/** Resolves Bench Press's row and detail in `language`, each on a fresh cache. */
const resolveBenchPressIn = async (language: string) => {
  await i18n.changeLanguage(language);
  const rows = await renderHook(() => useExercises(["bench-press"]), {
    wrapper: newWrapper(),
  });
  await waitFor(() =>
    expect(rows.result.current["bench-press"].isResolved).toBe(true)
  );
  const detail = await renderHook(() => useExerciseDetailQuery("bench-press"), {
    wrapper: newWrapper(),
  });
  await waitFor(() => expect(detail.result.current.data).toBeTruthy());
  await rows.unmount();
  await detail.unmount();
};

/** Bench Press's row and detail in `language` on a fresh cache, not waited for. */
const showBenchPressIn = async (language: string) => {
  await i18n.changeLanguage(language);
  const rows = await renderHook(() => useExercises(["bench-press"]), {
    wrapper: newWrapper(),
  });
  const detail = await renderHook(() => useExerciseDetailQuery("bench-press"), {
    wrapper: newWrapper(),
  });
  return {
    detail: detail.result.current.data,
    row: rows.result.current["bench-press"],
  };
};

describe("the MMKV cache", () => {
  it("caches resolved Exercises per App language under library.<language>.*", async () => {
    serveLibrary([
      libraryExercise("bench-press", {
        name: "Bench Press",
        translations: { uk: BENCH_PRESS_UK },
      }),
    ]);

    await resolveBenchPressIn("en");
    await resolveBenchPressIn("uk");

    const cached = (key: string) => JSON.parse(storage.getString(key) ?? "");
    expect(cached("library.en.exercise-summary.bench-press")).toMatchObject({
      value: { name: "Bench Press", slug: "bench-press" },
    });
    expect(cached("library.en.exercise.bench-press")).toMatchObject({
      value: { description: "About bench-press.", name: "Bench Press" },
    });
    expect(cached("library.uk.exercise-summary.bench-press")).toMatchObject({
      value: { name: "Жим лежачи", slug: "bench-press" },
    });
    expect(cached("library.uk.exercise.bench-press")).toMatchObject({
      value: { description: "Про жим лежачи.", name: "Жим лежачи" },
    });
  });

  it("sweeps the English-only library.exercise* keys once", async () => {
    storage.set("library.exercise-summary.bench-press", "{}");
    storage.set("library.exercise.bench-press", "{}");
    storage.set("library.exercise-summary.gone-move", "{}");
    storage.set("arnold.models", "kept");
    serveLibrary([libraryExercise("bench-press")]);

    const rows = await renderHook(() => useExercises(["bench-press"]), {
      wrapper: newWrapper(),
    });
    await waitFor(() =>
      expect(rows.result.current["bench-press"].isResolved).toBe(true)
    );

    expect(storage.getAllKeys().sort()).toEqual([
      "arnold.models",
      "library.en.exercise-summary.bench-press",
      "library.untranslated-exercises-swept",
    ]);

    // Swept once per install: an old key written later stays.
    storage.set("library.exercise-summary.squat", "{}");
    await renderHook(() => useExerciseDetailQuery("bench-press"), {
      wrapper: newWrapper(),
    });
    expect(storage.getString("library.exercise-summary.squat")).toBe("{}");
  });

  it("shows an Exercise cached in each App language offline in that language", async () => {
    const fake = serveLibrary([
      libraryExercise("bench-press", {
        name: "Bench Press",
        translations: { uk: BENCH_PRESS_UK },
      }),
    ]);
    await resolveBenchPressIn("en");
    await resolveBenchPressIn("uk");

    fake.failWith(new LibraryUnavailableError());
    const lookup = jest.spyOn(fake, "lookup");
    const get = jest.spyOn(fake, "get");
    const uk = await showBenchPressIn("uk");
    expect(uk.row).toMatchObject({ isResolved: true, name: "Жим лежачи" });
    expect(uk.detail).toMatchObject({
      description: "Про жим лежачи.",
      name: "Жим лежачи",
    });
    const en = await showBenchPressIn("en");
    expect(en.row).toMatchObject({ isResolved: true, name: "Bench Press" });
    expect(en.detail).toMatchObject({
      description: "About bench-press.",
      name: "Bench Press",
    });
    expect(lookup).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("the App language", () => {
  it("asks the Library in it, and refetches when it changes", async () => {
    const fake = serveLibrary([
      libraryExercise("bench-press", {
        name: "Bench Press",
        translations: { uk: BENCH_PRESS_UK },
      }),
      libraryExercise("squat"),
    ]);
    const lookup = jest.spyOn(fake, "lookup");
    const { result } = await renderHook(
      () => useExercises(["bench-press", "squat"]),
      { wrapper: newWrapper() }
    );
    await waitFor(() =>
      expect(result.current["bench-press"].name).toBe("Bench Press")
    );

    await act(() => i18n.changeLanguage("uk"));

    await waitFor(() =>
      expect(result.current["bench-press"].name).toBe("Жим лежачи")
    );
    // Untranslated, so wholly English.
    expect(result.current.squat.name).toBe("Squat");
    expect(lookup.mock.calls).toEqual([
      [["bench-press", "squat"], { language: "en" }],
      [["bench-press", "squat"], { language: "uk" }],
    ]);
  });
});

describe("useExercises", () => {
  it("resolves a large slug set through the client in chunks of 40", async () => {
    const slugs = Array.from(
      { length: 100 },
      (_, index) => `exercise-${index}`
    );
    const asked: string[][] = [];
    const fetch = jest.fn((url: string | URL | Request) => {
      const match = String(url).match(SLUGS_PATTERN);
      const batch = decodeURIComponent(match?.[1] ?? "").split(",");
      asked.push(batch);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: batch.map((slug) => libraryExercise(slug)),
            missing: [],
          }),
          { headers: { "content-type": "application/json" }, status: 200 }
        )
      );
    });
    library.current = createLibrary({
      fetch: fetch as typeof globalThis.fetch,
      token: () => Promise.resolve("session-token"),
      url: "https://exercises.test",
    });

    const { result } = await renderHook(() => useExercises(slugs), {
      wrapper: newWrapper(),
    });

    await waitFor(() =>
      expect(slugs.every((slug) => result.current[slug].isResolved)).toBe(true)
    );
    expect(asked.map((batch) => batch.length)).toEqual([40, 40, 20]);
    expect(asked.flat().sort()).toEqual([...slugs].sort());
    expect(result.current["exercise-7"].name).toBe("Exercise 7");
  });

  it("never sends a slug queued for one Library client through another", async () => {
    // Held timers keep the first lookup queued while the client changes, as a
    // test's unanswered lookup is when the next test swaps in its own client.
    jest.useFakeTimers();
    try {
      const earlier = serveLibrary([libraryExercise("stray-move")]);
      const earlierLookup = jest.spyOn(earlier, "lookup");
      const earlierRows = await renderHook(() => useExercises(["stray-move"]), {
        wrapper: newWrapper(),
      });

      const later = serveLibrary([libraryExercise("bench-press")]);
      const laterLookup = jest.spyOn(later, "lookup");
      const laterRows = await renderHook(() => useExercises(["bench-press"]), {
        wrapper: newWrapper(),
      });

      await act(() => jest.runOnlyPendingTimersAsync());
      await waitFor(() =>
        expect(laterRows.result.current["bench-press"].isResolved).toBe(true)
      );
      await waitFor(() =>
        expect(earlierRows.result.current["stray-move"].isResolved).toBe(true)
      );
      expect(earlierLookup.mock.calls).toEqual([
        [["stray-move"], { language: "en" }],
      ]);
      expect(laterLookup.mock.calls).toEqual([
        [["bench-press"], { language: "en" }],
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it("serves resolved Exercises from MMKV after a restart with the network failing", async () => {
    const fake = serveLibrary([
      libraryExercise("barbell-back-squat", { name: "Back Squat" }),
    ]);
    const first = await renderHook(() => useExercises(["barbell-back-squat"]), {
      wrapper: newWrapper(),
    });
    await waitFor(() =>
      expect(first.result.current["barbell-back-squat"].isResolved).toBe(true)
    );
    await first.unmount();

    fake.failWith(new LibraryUnavailableError());
    const lookup = jest.spyOn(fake, "lookup");
    const { result } = await renderHook(
      () => useExercises(["barbell-back-squat"]),
      { wrapper: newWrapper() }
    );

    expect(result.current["barbell-back-squat"]).toEqual({
      isResolved: true,
      muscle_groups: ["chest"],
      name: "Back Squat",
      slug: "barbell-back-squat",
      thumbnail_url: "https://media.test/render/barbell-back-squat.jpg",
      video_url: "https://media.test/barbell-back-squat.mp4",
    });
    // Saved just now, so still fresh: nothing to refetch.
    expect(lookup).not.toHaveBeenCalled();
  });

  it("names an unknown slug after itself, with nothing to link to", async () => {
    serveLibrary([libraryExercise("bench-press")]);

    const { result } = await renderHook(
      () => useExercises(["bench-press", "barbell-back-squat"]),
      { wrapper: newWrapper() }
    );

    expect(result.current["barbell-back-squat"].name).toBe(
      "Barbell back squat"
    );
    await waitFor(() =>
      expect(result.current["bench-press"].isResolved).toBe(true)
    );
    expect(result.current["barbell-back-squat"]).toEqual({
      isResolved: false,
      muscle_groups: [],
      name: "Barbell back squat",
      slug: "barbell-back-squat",
      thumbnail_url: null,
      video_url: null,
    });
  });

  it("falls back to the slug's name while the Library fails", async () => {
    const fake = serveLibrary([libraryExercise("bench-press")]);
    fake.failWith(new LibraryUnavailableError());
    const lookup = jest.spyOn(fake, "lookup");

    const { result } = await renderHook(() => useExercises(["bench-press"]), {
      wrapper: newWrapper(),
    });

    await waitFor(() => expect(lookup).toHaveBeenCalled());
    expect(result.current["bench-press"]).toMatchObject({
      isResolved: false,
      name: "Bench press",
    });
  });
});

describe("useExerciseDetailQuery", () => {
  it("shows an Exercise seen before from MMKV while offline", async () => {
    const fake = serveLibrary([libraryExercise("bench-press")]);
    const first = await renderHook(
      () => useExerciseDetailQuery("bench-press"),
      {
        wrapper: newWrapper(),
      }
    );
    await waitFor(() => expect(first.result.current.data).toBeTruthy());
    await first.unmount();

    fake.failWith(new LibraryUnavailableError());
    const { result } = await renderHook(
      () => useExerciseDetailQuery("bench-press"),
      { wrapper: newWrapper() }
    );

    expect(result.current.data).toMatchObject({
      description: "About bench-press.",
      name: "Bench Press",
    });
  });

  it("answers null for a slug the Library doesn't have", async () => {
    serveLibrary([]);

    const { result } = await renderHook(
      () => useExerciseDetailQuery("bench-press"),
      { wrapper: newWrapper() }
    );

    await waitFor(() => expect(result.current.data).toBeNull());
  });
});
