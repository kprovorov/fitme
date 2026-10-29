import { createHash } from "node:crypto";
import {
  type BundleExerciseText,
  type BundleMedia,
  type LibraryBundle,
  type TranslatedLanguage,
  translatedLanguages,
} from "./bundle";
import type { Exercise } from "./schemas";

/** The public Supabase Storage bucket the Library's media is uploaded to. */
export const MEDIA_BUCKET = "exercise-media";

/**
 * The Supabase project media URLs point at where none is configured (off
 * Vercel, and for the OpenAPI spec): fixture media isn't uploaded anywhere.
 */
export const PLACEHOLDER_SUPABASE_URL = "https://example.supabase.co";

const TRAILING_SLASHES = /\/+$/;

/**
 * The Library as the API serves it: every Exercise as its response
 * object, media URLs resolved. Built once, at build time.
 */
export interface ServedLibrary {
  /** Alphabetical by name, ties by Exercise slug: the order lists are served in. */
  exercises: Exercise[];
  /**
   * The sha256 of every Exercise as served (text, muscle groups and media
   * URLs, which carry the LFS oids) and of every translation: changes
   * whenever any Exercise does. Devices revalidate with it as the `ETag`.
   */
  hash: string;
  /** The search index: each Exercise's name lowercased, in the order of `exercises`. */
  searchNames: string[];
  /**
   * Each Exercise's text in every other App language, by Exercise slug. An
   * Exercise without a translation has no entry.
   * Not served yet: the API answers English only.
   */
  translations: Record<TranslatedLanguage, Record<string, BundleExerciseText>>;
}

const alphabetical = new Intl.Collator("en");

/**
 * A media file's object path in the bucket: `<slug>/<lfs-oid>.<ext>`. The
 * path changes whenever the content does, so an object is never overwritten.
 */
export const mediaObjectPath = (slug: string, media: BundleMedia) =>
  `${slug}/${media.oid}.${media.extension}`;

/**
 * Resolves the media URLs of a validated bundle's Exercises on the Supabase
 * project at `supabaseUrl`: thumbnails through the image transformation
 * (render) endpoint, so clients only append `width`/`height`; videos at their
 * public object URL.
 */
export const serveLibrary = (
  bundle: Pick<LibraryBundle, "exercises">,
  supabaseUrl: string
): ServedLibrary => {
  const storage = `${supabaseUrl.replace(TRAILING_SLASHES, "")}/storage/v1`;
  const sorted = bundle.exercises.toSorted(
    (a, b) =>
      alphabetical.compare(a.locales.en.name, b.locales.en.name) ||
      alphabetical.compare(a.slug, b.slug)
  );
  const exercises: Exercise[] = sorted.map((exercise) => {
    const { name, description, instructions } = exercise.locales.en;
    return {
      description,
      instructions,
      muscle_groups: exercise.muscle_groups,
      name,
      slug: exercise.slug,
      thumbnail_url: `${storage}/render/image/public/${MEDIA_BUCKET}/${mediaObjectPath(exercise.slug, exercise.thumbnail)}`,
      video_url: `${storage}/object/public/${MEDIA_BUCKET}/${mediaObjectPath(exercise.slug, exercise.video)}`,
    };
  });
  const translations = Object.fromEntries(
    translatedLanguages.map((language) => [
      language,
      Object.fromEntries(
        sorted.flatMap(({ locales, slug }) => {
          const text = locales[language];
          return text ? [[slug, text]] : [];
        })
      ),
    ])
  ) as ServedLibrary["translations"];
  return {
    exercises,
    hash: createHash("sha256")
      .update(JSON.stringify({ exercises, translations }))
      .digest("hex"),
    searchNames: exercises.map((exercise) => exercise.name.toLowerCase()),
    translations,
  };
};
