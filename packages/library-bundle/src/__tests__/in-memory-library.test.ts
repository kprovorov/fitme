import { describe, expect, it } from "vitest";

import { createInMemoryLibrary } from "../in-memory-library";
import type { BundleV2Exercise, LibraryBundleV2 } from "../schema-v2";

const SUPABASE_URL = "https://project.supabase.co/";
const THUMBNAIL_OID = "a".repeat(64);
const VIDEO_OID = "b".repeat(64);

const text = (name: string) => ({
  benefits: [`${name} benefit`],
  common_mistakes: [`${name} mistake`],
  long_description: `${name}, at length.`,
  name,
  short_description: `${name} in a line.`,
  steps: [`${name} step one`, `${name} step two`],
  tags: [`${name} tag`],
  use_cases: [`${name} use case`],
});

const exercise = (
  slug: string,
  name: string,
  overrides: Partial<BundleV2Exercise> = {}
): BundleV2Exercise => ({
  aliases: [],
  difficulty: "beginner",
  equipment: ["bodyweight"],
  locales: { en: text(name) },
  movement_patterns: ["push"],
  muscle_groups: ["chest"],
  secondary_muscle_groups: [],
  slug,
  thumbnail: { extension: "webp", oid: THUMBNAIL_OID },
  video: { extension: "mp4", oid: VIDEO_OID },
  ...overrides,
});

const benchPress = exercise("bench-press", "Bench press", {
  // written out of core's order on purpose
  equipment: ["bench", "barbell"],
  locales: { en: text("Bench press"), uk: text("Жим лежачи") },
  secondary_muscle_groups: ["triceps", "shoulders"],
});

const romanianDeadlift = exercise("romanian-deadlift", "Romanian deadlift", {
  aliases: ["RDL"],
  difficulty: "intermediate",
  equipment: ["barbell"],
  locales: { en: text("Romanian deadlift"), uk: text("Румунська тяга") },
  movement_patterns: ["hinge"],
  muscle_groups: ["hamstrings", "glutes"],
  secondary_muscle_groups: ["lower-back"],
});

const pullUp = exercise("pull-up", "Pull-up", {
  equipment: ["pull_up_bar", "bodyweight"],
  movement_patterns: ["pull"],
  muscle_groups: ["back"],
  secondary_muscle_groups: ["biceps"],
});

const pushUp = exercise("push-up", "Push-up", {
  locales: { en: text("Push-up"), uk: text("Віджимання") },
  secondary_muscle_groups: ["triceps"],
});

// two Exercises with the same name in every language, so the slug breaks the tie
const zebraB = exercise("zebra-b", "Zebra");
const zebraA = exercise("zebra-a", "Zebra");

const bundle: LibraryBundleV2 = {
  exercises: [pushUp, zebraB, romanianDeadlift, benchPress, pullUp, zebraA],
  replaced_slugs: {
    "barbell-bench-press": "bench-press",
    "flat-bench-press": "bench-press",
    rdl: "romanian-deadlift",
  },
  version: 2,
};

const library = createInMemoryLibrary(bundle, { supabaseUrl: SUPABASE_URL });

const slugsOf = (page: { data: { slug: string }[] }) =>
  page.data.map(({ slug }) => slug);

describe("the in-memory Library", () => {
  describe("languages", () => {
    it("answers in English by default, sorted by name, ties by slug", () => {
      expect(slugsOf(library.list())).toStrictEqual([
        "bench-press",
        "pull-up",
        "push-up",
        "romanian-deadlift",
        "zebra-a",
        "zebra-b",
      ]);
    });

    it("answers each Exercise in the language asked for, wholly in English without a translation", () => {
      const { data } = library.list({ language: "uk" });

      expect(data.map(({ name }) => name)).toStrictEqual([
        // Ukrainian's collation puts Cyrillic before Latin
        "Віджимання",
        "Жим лежачи",
        "Румунська тяга",
        "Pull-up",
        "Zebra",
        "Zebra",
      ]);
      expect(slugsOf(library.list({ language: "uk" })).slice(-2)).toStrictEqual(
        ["zebra-a", "zebra-b"]
      );

      expect(library.get("pull-up", { language: "uk" })).toMatchObject({
        long_description: "Pull-up, at length.",
        name: "Pull-up",
        short_description: "Pull-up in a line.",
        steps: ["Pull-up step one", "Pull-up step two"],
      });

      expect(library.get("bench-press", { language: "uk" })).toMatchObject({
        benefits: ["Жим лежачи benefit"],
        common_mistakes: ["Жим лежачи mistake"],
        long_description: "Жим лежачи, at length.",
        name: "Жим лежачи",
        short_description: "Жим лежачи in a line.",
        steps: ["Жим лежачи step one", "Жим лежачи step two"],
      });
    });

    it("sorts with the language's collation", () => {
      const accented = createInMemoryLibrary(
        {
          exercises: [
            exercise("z", "Zercher squat"),
            exercise("e", "Étirement"),
            exercise("a", "Arnold press"),
          ],
          version: 2,
        },
        { supabaseUrl: SUPABASE_URL }
      );

      // code-unit order would put É after Z
      expect(accented.list().data.map(({ name }) => name)).toStrictEqual([
        "Arnold press",
        "Étirement",
        "Zercher squat",
      ]);
    });
  });

  describe("fields", () => {
    it("answers a summary with the summary fields only, Equipment in core's order", () => {
      const [summary] = library.list({ search: "bench" }).data;

      expect(summary).toStrictEqual({
        difficulty: "beginner",
        equipment: ["barbell", "bench"],
        movement_patterns: ["push"],
        muscle_groups: ["chest"],
        name: "Bench press",
        secondary_muscle_groups: ["triceps", "shoulders"],
        slug: "bench-press",
        thumbnail_url: `https://project.supabase.co/storage/v1/render/image/public/library/bench-press/${THUMBNAIL_OID}.webp`,
        video_url: `https://project.supabase.co/storage/v1/object/public/library/bench-press/${VIDEO_OID}.mp4`,
      });
    });

    it("answers an Exercise in full with its text, never its use cases or tags", () => {
      expect(library.get("pull-up")).toStrictEqual({
        benefits: ["Pull-up benefit"],
        common_mistakes: ["Pull-up mistake"],
        difficulty: "beginner",
        equipment: ["bodyweight", "pull_up_bar"],
        long_description: "Pull-up, at length.",
        movement_patterns: ["pull"],
        muscle_groups: ["back"],
        name: "Pull-up",
        secondary_muscle_groups: ["biceps"],
        short_description: "Pull-up in a line.",
        slug: "pull-up",
        steps: ["Pull-up step one", "Pull-up step two"],
        thumbnail_url: `https://project.supabase.co/storage/v1/render/image/public/library/pull-up/${THUMBNAIL_OID}.webp`,
        video_url: `https://project.supabase.co/storage/v1/object/public/library/pull-up/${VIDEO_OID}.mp4`,
      });
    });
  });

  describe("search", () => {
    it("matches a case-insensitive substring of the name in the language asked for", () => {
      expect(
        slugsOf(library.list({ language: "uk", search: "ЛЕЖАЧИ" }))
      ).toStrictEqual(["bench-press"]);
    });

    it("matches the English name in any language", () => {
      expect(
        slugsOf(library.list({ language: "uk", search: "  deadlift " }))
      ).toStrictEqual(["romanian-deadlift"]);
    });

    it("matches an alias", () => {
      expect(slugsOf(library.list({ search: "rdl" }))).toStrictEqual([
        "romanian-deadlift",
      ]);
      expect(
        slugsOf(library.list({ language: "uk", search: "RDL" }))
      ).toStrictEqual(["romanian-deadlift"]);
    });

    it("answers nothing for a term no name has", () => {
      expect(library.list({ search: "zercher" })).toStrictEqual({
        data: [],
        hasMore: false,
        total: 0,
      });
    });
  });

  describe("filters", () => {
    it("narrows to Exercises with any of the primary muscle groups, never a secondary one", () => {
      expect(
        slugsOf(library.list({ muscleGroups: ["triceps"] }))
      ).toStrictEqual([]);
      expect(
        slugsOf(library.list({ muscleGroups: ["glutes", "back"] }))
      ).toStrictEqual(["pull-up", "romanian-deadlift"]);
    });

    it("narrows to Exercises needing any of the Equipment", () => {
      expect(
        slugsOf(library.list({ equipment: ["pull_up_bar"] }))
      ).toStrictEqual(["pull-up"]);
      expect(slugsOf(library.list({ equipment: ["barbell"] }))).toStrictEqual([
        "bench-press",
        "romanian-deadlift",
      ]);
    });

    it("narrows by muscle groups, Equipment and the search together", () => {
      expect(
        slugsOf(
          library.list({
            equipment: ["bodyweight"],
            muscleGroups: ["chest"],
            search: "push",
          })
        )
      ).toStrictEqual(["push-up"]);
      expect(
        slugsOf(
          library.list({ equipment: ["bodyweight"], muscleGroups: ["back"] })
        )
      ).toStrictEqual(["pull-up"]);
    });
  });

  describe("paging", () => {
    it("pages with limit and offset, with the total and whether more follow", () => {
      expect(library.list({ limit: 2 })).toMatchObject({
        hasMore: true,
        total: 6,
      });
      expect(slugsOf(library.list({ limit: 2, offset: 2 }))).toStrictEqual([
        "push-up",
        "romanian-deadlift",
      ]);
      expect(library.list({ limit: 2, offset: 4 })).toMatchObject({
        hasMore: false,
        total: 6,
      });
    });

    it("answers 20 by default and an empty page past the end", () => {
      expect(library.list().data).toHaveLength(6);
      expect(library.list({ offset: 10 })).toStrictEqual({
        data: [],
        hasMore: false,
        total: 6,
      });
    });
  });

  it("never answers the tail for a negative offset, nor an endless empty page for a limit of 0", () => {
    expect(slugsOf(library.list({ limit: 2, offset: -2 }))).toStrictEqual([
      "bench-press",
      "pull-up",
    ]);
    expect(library.list({ limit: 0 }).data).toHaveLength(1);
  });

  it("answers objects no caller can change for the next", () => {
    const [summary] = library.list().data;

    expect(() => summary?.muscle_groups.push("neck")).toThrow(TypeError);
    expect(library.get("bench-press")?.muscle_groups).toStrictEqual(["chest"]);
  });

  describe("get", () => {
    it("answers null for a slug no Exercise has", () => {
      expect(library.get("zercher-squat")).toBeNull();
    });

    it("answers an old slug with its replacement", () => {
      expect(library.get("rdl", { language: "uk" })).toMatchObject({
        name: "Румунська тяга",
        slug: "romanian-deadlift",
      });
    });
  });

  describe("lookup", () => {
    it("answers in asked order, each entry naming the slug asked for, the rest missing", () => {
      const { data, missing } = library.lookup(
        ["push-up", "zercher-squat", "barbell-bench-press", "push-up", "rdl"],
        { language: "uk" }
      );

      expect(
        data.map(({ name, requested_slug, slug }) => ({
          name,
          requested_slug,
          slug,
        }))
      ).toStrictEqual([
        { name: "Віджимання", requested_slug: "push-up", slug: "push-up" },
        {
          name: "Жим лежачи",
          requested_slug: "barbell-bench-press",
          slug: "bench-press",
        },
        {
          name: "Румунська тяга",
          requested_slug: "rdl",
          slug: "romanian-deadlift",
        },
      ]);
      expect(missing).toStrictEqual(["zercher-squat"]);
    });

    it("answers two old slugs of one Exercise each under its own name", () => {
      expect(
        library
          .lookup(["barbell-bench-press", "flat-bench-press"])
          .data.map(({ requested_slug, slug }) => [requested_slug, slug])
      ).toStrictEqual([
        ["barbell-bench-press", "bench-press"],
        ["flat-bench-press", "bench-press"],
      ]);
    });
  });

  describe("the slug check", () => {
    it("answers each slug known or unknown, an old one with its replacement, and each known one's primary muscle groups", () => {
      expect(
        library.checkSlugs([
          "romanian-deadlift",
          "rdl",
          "zercher-squat",
          "rdl",
          "push-up",
        ])
      ).toStrictEqual({
        known: [
          {
            exercise_slug: "romanian-deadlift",
            muscle_groups: ["hamstrings", "glutes"],
            requested_slug: "romanian-deadlift",
          },
          {
            exercise_slug: "romanian-deadlift",
            muscle_groups: ["hamstrings", "glutes"],
            requested_slug: "rdl",
          },
          {
            exercise_slug: "push-up",
            muscle_groups: ["chest"],
            requested_slug: "push-up",
          },
        ],
        unknown: ["zercher-squat"],
      });
    });

    it("knows no old slug once the bundle has no map", () => {
      const withoutMap = createInMemoryLibrary(
        { exercises: bundle.exercises, version: 2 },
        { supabaseUrl: SUPABASE_URL }
      );

      expect(withoutMap.checkSlugs(["rdl"])).toStrictEqual({
        known: [],
        unknown: ["rdl"],
      });
      expect(withoutMap.get("rdl")).toBeNull();
    });
  });

  describe("the content hash", () => {
    it("is the same for the same bundle", () => {
      expect(library.hash).toMatch(/^[0-9a-f]{64}$/u);
      expect(
        createInMemoryLibrary(bundle, { supabaseUrl: SUPABASE_URL }).hash
      ).toBe(library.hash);
    });

    it("changes with a translation, the map or the media's origin", () => {
      const others = [
        createInMemoryLibrary(
          {
            ...bundle,
            exercises: [
              ...bundle.exercises.filter(({ slug }) => slug !== "pull-up"),
              {
                ...pullUp,
                locales: { en: text("Pull-up"), uk: text("Підтягування") },
              },
            ],
          },
          { supabaseUrl: SUPABASE_URL }
        ),
        createInMemoryLibrary(
          { ...bundle, replaced_slugs: {} },
          { supabaseUrl: SUPABASE_URL }
        ),
        createInMemoryLibrary(bundle, {
          supabaseUrl: "https://other.supabase.co",
        }),
      ];

      for (const other of others) {
        expect(other.hash).not.toBe(library.hash);
      }
    });
  });
});
