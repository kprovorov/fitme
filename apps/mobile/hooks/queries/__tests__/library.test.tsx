/**
 * The Library hooks over the fake Public API's Exercise routes (FIT-755):
 * the per-language MMKV copies, the lookup's batching, old
 * slugs resolving to their replacement, and the offline fallbacks.
 */
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
import { readCachedExercise, readCachedSummary } from "~/lib/library-cache";
import { storage } from "~/lib/mmkv";
import {
  EXERCISES_UNAVAILABLE,
  FAKE_SUPABASE_URL,
  failExercises,
  fakeExercise,
  serveExercises,
} from "~/test-utils/fake-exercises";
import { fakePublicApi } from "~/test-utils/fake-public-api";
import { createTestQueryClient } from "~/test-utils/query-client";

import { useExerciseDetailQuery, useExercises } from "../library";

/** A fresh query cache, as after a restart of the app. */
const newWrapper = () => {
  const client = createTestQueryClient();

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

/** The queries of the lookups sent (`GET /v1/exercises?slugs=`). */
const lookups = () =>
  fakePublicApi.requests
    .filter(
      (request) =>
        request.route === "GET /v1/exercises" &&
        request.query.slugs !== undefined
    )
    .map((request) => request.query);

/** The Exercise reads sent (`GET /v1/exercises/{slug}`), by path. */
const detailReads = () =>
  fakePublicApi.requests
    .filter((request) => request.route === "GET /v1/exercises/{slug}")
    .map((request) => request.path);

/** Every Exercise request sent, lookups and reads alike. */
const exerciseRequests = () =>
  fakePublicApi.requests.filter((request) =>
    request.route.startsWith("GET /v1/exercises")
  );

beforeEach(() => {
  storage.clearAll();
});

// The App language is the i18n instance's, shared by every test of the file.
afterEach(async () => {
  await i18n.changeLanguage("en");
});

const BENCH_PRESS = fakeExercise("bench-press", {
  name: "Bench Press",
  translations: {
    uk: { name: "Жим лежачи", short_description: "Про жим лежачи." },
  },
});

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
  it("caches resolved Exercises per App language under exercises.<language>.*", async () => {
    serveExercises([BENCH_PRESS]);

    await resolveBenchPressIn("en");
    await resolveBenchPressIn("uk");

    const cached = (key: string) => JSON.parse(storage.getString(key) ?? "");
    expect(cached("exercises.en.summary.bench-press")).toMatchObject({
      value: { name: "Bench Press", slug: "bench-press" },
    });
    expect(cached("exercises.en.detail.bench-press")).toMatchObject({
      value: { name: "Bench Press", short_description: "About Bench Press" },
    });
    expect(cached("exercises.uk.summary.bench-press")).toMatchObject({
      value: { name: "Жим лежачи", slug: "bench-press" },
    });
    expect(cached("exercises.uk.detail.bench-press")).toMatchObject({
      value: { name: "Жим лежачи", short_description: "Про жим лежачи." },
    });
  });

  it("shows an Exercise cached in each App language offline in that language", async () => {
    serveExercises([BENCH_PRESS]);

    await resolveBenchPressIn("en");
    await resolveBenchPressIn("uk");

    failExercises(EXERCISES_UNAVAILABLE);
    const sent = exerciseRequests().length;
    const uk = await showBenchPressIn("uk");
    expect(uk.row).toMatchObject({ isResolved: true, name: "Жим лежачи" });
    expect(uk.detail).toMatchObject({
      name: "Жим лежачи",
      short_description: "Про жим лежачи.",
    });
    const en = await showBenchPressIn("en");
    expect(en.row).toMatchObject({ isResolved: true, name: "Bench Press" });
    expect(en.detail).toMatchObject({
      name: "Bench Press",
      short_description: "About Bench Press",
    });
    expect(exerciseRequests()).toHaveLength(sent);
  });

  it("counts a malformed copy as no copy, and asks the Public API", async () => {
    serveExercises([BENCH_PRESS]);
    // A copy without the new Library's fields.
    storage.set(
      "exercises.en.summary.bench-press",
      JSON.stringify({
        savedAt: Date.now(),
        value: { name: "Stale", slug: "bench-press" },
      })
    );

    expect(readCachedSummary("en", "bench-press")).toBeUndefined();

    const { result } = await renderHook(() => useExercises(["bench-press"]), {
      wrapper: newWrapper(),
    });

    expect(result.current["bench-press"].isResolved).toBe(false);
    await waitFor(() =>
      expect(result.current["bench-press"].name).toBe("Bench Press")
    );
    expect(lookups()).toEqual([{ slugs: "bench-press" }]);
  });
});

describe("the App language", () => {
  it("asks the Public API in it, and refetches when it changes", async () => {
    serveExercises([BENCH_PRESS, fakeExercise("squat", { name: "Squat" })]);

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
    // English is the API's default, so it isn't sent.
    expect(lookups()).toEqual([
      { slugs: "bench-press,squat" },
      { language: "uk", slugs: "bench-press,squat" },
    ]);
  });
});

describe("useExercises", () => {
  it("resolves a large slug set in lookups of 40", async () => {
    const slugs = Array.from(
      { length: 100 },
      (_, index) => `exercise-${index}`
    );

    serveExercises(slugs.map((slug) => fakeExercise(slug)));

    const { result } = await renderHook(() => useExercises(slugs), {
      wrapper: newWrapper(),
    });

    await waitFor(() =>
      expect(slugs.every((slug) => result.current[slug].isResolved)).toBe(true)
    );

    const asked = lookups().map(({ slugs: sent }) => sent?.split(",") ?? []);
    expect(asked.map((batch) => batch.length)).toEqual([40, 40, 20]);
    expect(asked.flat().toSorted()).toEqual([...slugs].toSorted());
    expect(result.current["exercise-7"].name).toBe("Exercise 7");
  });

  it("shares one lookup between the slugs asked for in the same tick", async () => {
    // Held timers keep the batch open while both rows ask.
    jest.useFakeTimers();

    try {
      serveExercises([BENCH_PRESS, fakeExercise("squat")]);
      const wrapper = newWrapper();

      const bench = await renderHook(() => useExercises(["bench-press"]), {
        wrapper,
      });

      const squat = await renderHook(() => useExercises(["squat"]), {
        wrapper,
      });

      await act(() => jest.advanceTimersByTimeAsync(10));

      expect(squat.result.current.squat.isResolved).toBe(true);
      expect(bench.result.current["bench-press"].isResolved).toBe(true);
      expect(lookups()).toEqual([{ slugs: "bench-press,squat" }]);
    } finally {
      jest.useRealTimers();
    }
  });

  it("shows a replaced slug as the Exercise replacing it, linking to its own slug", async () => {
    serveExercises(
      [fakeExercise("barbell-bench-press", { name: "Barbell Bench Press" })],
      { replacedSlugs: { "bench-press": "barbell-bench-press" } }
    );

    const { result } = await renderHook(() => useExercises(["bench-press"]), {
      wrapper: newWrapper(),
    });

    await waitFor(() =>
      expect(result.current["bench-press"].isResolved).toBe(true)
    );
    expect(result.current["bench-press"]).toMatchObject({
      name: "Barbell Bench Press",
      slug: "barbell-bench-press",
    });
    // Kept under the slug asked for, so it shows offline too.
    expect(readCachedSummary("en", "bench-press")?.value).toMatchObject({
      slug: "barbell-bench-press",
    });
  });

  it("serves resolved Exercises from MMKV after a restart with the network failing", async () => {
    serveExercises([
      fakeExercise("barbell-back-squat", {
        muscle_groups: ["quadriceps", "glutes"],
        name: "Back Squat",
      }),
    ]);

    const first = await renderHook(() => useExercises(["barbell-back-squat"]), {
      wrapper: newWrapper(),
    });

    await waitFor(() =>
      expect(first.result.current["barbell-back-squat"].isResolved).toBe(true)
    );
    await first.unmount();

    failExercises(EXERCISES_UNAVAILABLE);
    const sent = exerciseRequests().length;

    const { result } = await renderHook(
      () => useExercises(["barbell-back-squat"]),
      { wrapper: newWrapper() }
    );

    expect(result.current["barbell-back-squat"]).toEqual({
      isResolved: true,
      muscle_groups: ["quadriceps", "glutes"],
      name: "Back Squat",
      slug: "barbell-back-squat",
      thumbnail_url: expect.stringContaining(FAKE_SUPABASE_URL),
      video_url: expect.stringContaining(FAKE_SUPABASE_URL),
    });
    // Saved just now, so still fresh: nothing to refetch.
    expect(exerciseRequests()).toHaveLength(sent);
  });

  it("names an unknown slug after itself, with nothing to link to", async () => {
    serveExercises([BENCH_PRESS]);

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

  it("answers a slug the API can't take as missing, without failing the others", async () => {
    serveExercises([BENCH_PRESS]);
    const tooLong = "x".repeat(101);

    const { result } = await renderHook(
      () => useExercises(["bench-press", tooLong]),
      { wrapper: newWrapper() }
    );

    await waitFor(() =>
      expect(result.current["bench-press"].isResolved).toBe(true)
    );
    expect(result.current[tooLong].isResolved).toBe(false);
    expect(lookups()).toEqual([{ slugs: "bench-press" }]);
  });

  it("falls back to the slug's name while the Library fails", async () => {
    serveExercises([BENCH_PRESS]);
    failExercises(EXERCISES_UNAVAILABLE);

    const { result } = await renderHook(() => useExercises(["bench-press"]), {
      wrapper: newWrapper(),
    });

    await waitFor(() => expect(lookups().length).toBeGreaterThan(0));
    expect(result.current["bench-press"]).toMatchObject({
      isResolved: false,
      name: "Bench press",
    });
  });
});

describe("useExerciseDetailQuery", () => {
  it("shows an Exercise seen before from MMKV while offline", async () => {
    serveExercises([BENCH_PRESS]);

    const first = await renderHook(
      () => useExerciseDetailQuery("bench-press"),
      {
        wrapper: newWrapper(),
      }
    );

    await waitFor(() => expect(first.result.current.data).toBeTruthy());
    await first.unmount();

    failExercises(EXERCISES_UNAVAILABLE);

    const { result } = await renderHook(
      () => useExerciseDetailQuery("bench-press"),
      { wrapper: newWrapper() }
    );

    expect(result.current.data).toMatchObject({
      name: "Bench Press",
      short_description: "About Bench Press",
      steps: ["Do Bench Press"],
    });
  });

  it("answers a replaced slug with the Exercise replacing it", async () => {
    serveExercises(
      [fakeExercise("barbell-bench-press", { name: "Barbell Bench Press" })],
      { replacedSlugs: { "bench-press": "barbell-bench-press" } }
    );

    const { result } = await renderHook(
      () => useExerciseDetailQuery("bench-press"),
      { wrapper: newWrapper() }
    );

    await waitFor(() =>
      expect(result.current.data).toMatchObject({
        name: "Barbell Bench Press",
        slug: "barbell-bench-press",
      })
    );
    expect(detailReads()).toEqual(["/v1/exercises/bench-press"]);
  });

  it("keeps a replaced slug's answer under its replacement too, for its guide offline", async () => {
    serveExercises(
      [fakeExercise("barbell-bench-press", { name: "Barbell Bench Press" })],
      { replacedSlugs: { "bench-press": "barbell-bench-press" } }
    );

    const first = await renderHook(
      () => useExerciseDetailQuery("bench-press"),
      { wrapper: newWrapper() }
    );

    await waitFor(() => expect(first.result.current.data).toBeTruthy());

    expect(readCachedExercise("en", "bench-press")?.value.slug).toBe(
      "barbell-bench-press"
    );
    expect(readCachedExercise("en", "barbell-bench-press")?.value.name).toBe(
      "Barbell Bench Press"
    );

    // The guide opens under the replacement's own slug, after a restart,
    // with the network gone.
    failExercises("network");
    const reads = detailReads().length;

    const guide = await renderHook(
      () => useExerciseDetailQuery("barbell-bench-press"),
      { wrapper: newWrapper() }
    );

    expect(guide.result.current.data).toMatchObject({
      name: "Barbell Bench Press",
      slug: "barbell-bench-press",
    });
    expect(detailReads()).toHaveLength(reads);
  });

  it("answers null for a slug the API can't take, asking nothing", async () => {
    serveExercises([BENCH_PRESS]);

    const { result } = await renderHook(
      () => useExerciseDetailQuery("x".repeat(101)),
      { wrapper: newWrapper() }
    );

    await waitFor(() => expect(result.current.data).toBeNull());
    expect(detailReads()).toEqual([]);
  });

  it("answers null for a slug the Library doesn't have", async () => {
    serveExercises([]);

    const { result } = await renderHook(
      () => useExerciseDetailQuery("bench-press"),
      { wrapper: newWrapper() }
    );

    await waitFor(() => expect(result.current.data).toBeNull());
  });
});
