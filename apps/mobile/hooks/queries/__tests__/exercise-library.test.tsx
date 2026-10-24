import {
  createExerciseLibrary,
  ExerciseLibraryUnavailableError,
} from "@fitme/exercise-library";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { storage } from "~/lib/mmkv";
import {
  library,
  libraryExercise,
  serveLibrary,
} from "~/test-utils/fake-exercise-library";
import { createTestQueryClient } from "~/test-utils/query-client";
import { useExerciseDetailQuery, useExercises } from "../exercise-library";

jest.mock(
  "~/lib/exercise-library",
  () =>
    jest.requireActual<typeof import("~/test-utils/fake-exercise-library")>(
      "~/test-utils/fake-exercise-library"
    ).exerciseLibraryModule
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
    library.current = createExerciseLibrary({
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

    fake.failWith(new ExerciseLibraryUnavailableError());
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

  it("falls back to the slug's name while the Exercise Library fails", async () => {
    const fake = serveLibrary([libraryExercise("bench-press")]);
    fake.failWith(new ExerciseLibraryUnavailableError());
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

    fake.failWith(new ExerciseLibraryUnavailableError());
    const { result } = await renderHook(
      () => useExerciseDetailQuery("bench-press"),
      { wrapper: newWrapper() }
    );

    expect(result.current.data).toMatchObject({
      description: "About bench-press.",
      name: "Bench Press",
    });
  });

  it("answers null for a slug the Exercise Library doesn't have", async () => {
    serveLibrary([]);

    const { result } = await renderHook(
      () => useExerciseDetailQuery("bench-press"),
      { wrapper: newWrapper() }
    );

    await waitFor(() => expect(result.current.data).toBeNull());
  });
});
