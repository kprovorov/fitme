import type { LegacyMuscleGroup } from "@fitme/core/models";

// The Library API's `GET /covers` answer, mirroring `apps/library`'s zod
// schemas (src/schemas.ts): change both together.

/**
 * A Cover (`GET /covers`): a photo a Workout's card shows, tagged with the
 * muscle groups it suits (ADR 0014). No text, so no language.
 */
export interface Cover {
  /** The Cover's permanent id, which a Workout stores. */
  id: string;
  /** Supabase's image transformation endpoint: append `width` / `height`. */
  image_url: string;
  muscle_groups: LegacyMuscleGroup[];
}

/**
 * What the mobile app reads the Library API through: only the Covers, since
 * Exercises come from the Public API (ADR 0022).
 */
export interface Library {
  /** Every Cover in the Library, in its order; empty when it has none. */
  covers: () => Promise<Cover[]>;
}
