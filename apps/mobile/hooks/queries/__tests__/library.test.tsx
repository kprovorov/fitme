import { createLibrary, LibraryUnavailableError } from "@fitme/library-sdk";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { storage } from "~/lib/mmkv";
import {
  library,
  libraryExercise,
  serveLibrary,
} from "~/test-utils/fake-library";
import { createTestQueryClient, until } from "~/test-utils/query-client";
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

describe("the MMKV cache", () => {
  it("sweeps the old exercises.* keys once and caches under library.*", async () => {
    storage.set("exercises.summary.bench-press", "{}");
    storage.set("exercises.exercise.bench-press", "{}");
    storage.set("exercises.summary.gone-move", "{}");
    storage.set("arnold.models", "kept");
    const fake = serveLibrary([
      libraryExercise("bench-press", { name: "Bench Press" }),
    ]);
    const lookup = jest.spyOn(fake, "lookup");

    const rows = await renderHook(() => useExercises(["bench-press"]), {
      wrapper: newWrapper(),
    });
    await waitFor(() =>
      expect(rows.result.current["bench-press"].isResolved).toBe(true)
    );
    const detail = await renderHook(
      () => useExerciseDetailQuery("bench-press"),
      { wrapper: newWrapper() }
    );
    await waitFor(() => expect(detail.result.current.data).toBeTruthy());

    const keys = storage.getAllKeys();
    expect(keys.filter((key) => key.startsWith("exercises."))).toEqual([]);
    expect(keys).toEqual(
      expect.arrayContaining([
        "arnold.models",
        "library.exercise-summary.bench-press",
        "library.exercise.bench-press",
      ])
    );
    expect(
      JSON.parse(storage.getString("library.exercise.bench-press") ?? "")
    ).toMatchObject({ value: { name: "Bench Press", slug: "bench-press" } });

    // Swept once per install: an old key written later stays.
    storage.set("exercises.summary.squat", "{}");
    await renderHook(() => useExercises(["squat"]), { wrapper: newWrapper() });
    // Answered before the test ends, so no lookup is left for the next one.
    const squatCall = () =>
      lookup.mock.calls.findIndex(([slugs]) => slugs.includes("squat"));
    await until(() => squatCall() >= 0);
    await lookup.mock.results[squatCall()]?.value;
    expect(storage.getString("exercises.summary.squat")).toBe("{}");
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
      expect(earlierLookup.mock.calls).toEqual([[["stray-move"]]]);
      expect(laterLookup.mock.calls).toEqual([[["bench-press"]]]);
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
