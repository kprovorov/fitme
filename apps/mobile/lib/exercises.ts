import type { components } from "@fitme/api-client";

/** An Exercise of the Library as `GET /v1/exercises` lists it (ADR 0022). */
export type ExerciseSummary = components["schemas"]["ExerciseSummary"];

/** An Exercise in full, as `GET /v1/exercises/{slug}` answers it. */
export type Exercise = components["schemas"]["Exercise"];

/** One page of `GET /v1/exercises`. */
export type ExercisePage = components["schemas"]["ExercisePage"];
