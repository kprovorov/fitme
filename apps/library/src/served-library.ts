import { createHash } from "node:crypto";
import {
  type AppLanguage,
  appLanguages,
  type MuscleGroup,
} from "@fitme/core/models";
import type { BundleMedia, LibraryBundle } from "./bundle";
import type { Exercise } from "./schemas";

/** A Cover as the API serves it: the same in every App language. */
export interface ServedCover {
  id: string;
  /** On the render endpoint, so clients append `width`/`height`. */
  image_url: string;
  muscle_groups: MuscleGroup[];
}

/** The public Supabase Storage bucket the Library's media is uploaded to. */
export const MEDIA_BUCKET = "exercise-media";

/**
 * The Supabase project media URLs point at where none is configured (off
 * Vercel, and for the OpenAPI spec): fixture media isn't uploaded anywhere.
 */
export const PLACEHOLDER_SUPABASE_URL = "https://example.supabase.co";

const TRAILING_SLASHES = /\/+$/;

/** The Library in one App language, as the API serves it in that language. */
export interface ServedLanguage {
  /**
   * Every Exercise in this language, or wholly in English without a
   * translation, sorted by that name with the language's collation, ties by
   * Exercise slug: the order lists are served in.
   */
  exercises: Exercise[];
  /**
   * The search index, in the order of `exercises`: each Exercise's names
   * lowercased, the served one first, then its English one when that differs.
   */
  searchNames: string[][];
}

/**
 * The Library as the API serves it: every Exercise as its response object
 * in every App language, media URLs resolved. Built once, at build time.
 */
export interface ServedLibrary {
  /** Every Cover, in bundle order (none for a bundle without Covers). */
  covers: ServedCover[];
  /**
   * The sha256 of every Cover and every language's Exercises as served
   * (text, muscle groups and media URLs, which carry the LFS oids): changes
   * whenever any Exercise, translation or Cover does. Devices revalidate with
   * it as the `ETag`, which stays valid per URL since the language is part of
   * the URL.
   */
  hash: string;
  languages: Record<AppLanguage, ServedLanguage>;
}

/**
 * A media file's object path in the bucket: `<slug>/<lfs-oid>.<ext>`. The
 * path changes whenever the content does, so an object is never overwritten.
 */
export const mediaObjectPath = (slug: string, media: BundleMedia) =>
  `${slug}/${media.oid}.${media.extension}`;

/** A Cover's image path in the bucket, apart from Exercise media: `covers/<id>/<lfs-oid>.<ext>`. */
export const coverObjectPath = (id: string, image: BundleMedia) =>
  `covers/${id}/${image.oid}.${image.extension}`;

/**
 * Serves a validated bundle's Exercises in every App language, each
 * language's order and search index worked out here, once, and its Covers.
 * Media URLs are resolved on the Supabase project at `supabaseUrl`:
 * thumbnails and Cover images through the image transformation (render)
 * endpoint, so clients only append `width`/`height`; videos at their public
 * object URL.
 */
export const serveLibrary = (
  bundle: Pick<LibraryBundle, "covers" | "exercises">,
  supabaseUrl: string
): ServedLibrary => {
  const storage = `${supabaseUrl.replace(TRAILING_SLASHES, "")}/storage/v1`;
  const serveIn = (language: AppLanguage): ServedLanguage => {
    const collator = new Intl.Collator(language);
    const served = bundle.exercises.map((exercise) => {
      const english = exercise.locales.en;
      // an untranslated Exercise is served wholly in English, never field by field
      const { name, description, instructions } =
        exercise.locales[language] ?? english;
      const names = [name.toLowerCase(), english.name.toLowerCase()];
      return {
        exercise: {
          description,
          instructions,
          muscle_groups: exercise.muscle_groups,
          name,
          slug: exercise.slug,
          thumbnail_url: `${storage}/render/image/public/${MEDIA_BUCKET}/${mediaObjectPath(exercise.slug, exercise.thumbnail)}`,
          video_url: `${storage}/object/public/${MEDIA_BUCKET}/${mediaObjectPath(exercise.slug, exercise.video)}`,
        },
        searchNames: [...new Set(names)],
      };
    });
    const sorted = served.toSorted(
      (a, b) =>
        collator.compare(a.exercise.name, b.exercise.name) ||
        collator.compare(a.exercise.slug, b.exercise.slug)
    );
    return {
      exercises: sorted.map(({ exercise }) => exercise),
      searchNames: sorted.map(({ searchNames }) => searchNames),
    };
  };
  const languages = Object.fromEntries(
    appLanguages.map((language) => [language, serveIn(language)])
  ) as ServedLibrary["languages"];
  const covers = (bundle.covers ?? []).map(
    (cover): ServedCover => ({
      id: cover.id,
      image_url: `${storage}/render/image/public/${MEDIA_BUCKET}/${coverObjectPath(cover.id, cover.image)}`,
      muscle_groups: cover.muscle_groups,
    })
  );
  return {
    covers,
    hash: createHash("sha256")
      .update(JSON.stringify({ covers, languages }))
      .digest("hex"),
    languages,
  };
};
