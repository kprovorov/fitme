import type { AppLanguage, ArnoldModelId } from "./models";

/**
 * The cards Arnold can show in the app (ADR 0027), each by its id and the
 * one tool that draws it. A build sends the ids of the cards it can draw in
 * its client context (`cards`), and Arnold offers a card's tool only to a
 * build that lists it. Every card's tool is in `arnoldToolNames`.
 */
export const arnoldCards = [
  { id: "exercises", tool: "show_exercises" },
  { id: "workout", tool: "show_workout" },
  { id: "plan", tool: "show_plan" },
  { id: "workout_session", tool: "show_workout_session" },
  { id: "profile", tool: "show_profile" },
  { id: "exercise_history", tool: "show_exercise_history" },
  { id: "weekly_goal", tool: "show_weekly_goal" },
  { id: "lifetime_totals", tool: "show_lifetime_totals" },
  { id: "plan_proposal", tool: "propose_plan" },
] as const satisfies readonly { id: string; tool: ArnoldToolName }[];

export type ArnoldCard = (typeof arnoldCards)[number];

export type ArnoldCardId = ArnoldCard["id"];

export const arnoldCardIds: readonly ArnoldCardId[] = arnoldCards.map(
  (card) => card.id
);

/**
 * Every tool Arnold has or gets in the Arnold redesign, the only list: the
 * mobile status line and its catalog strings are keyed by it. Today's tools
 * (one per file in `apps/arnold/agent/tools`), then the cards' tools, then
 * the new reads.
 */
export const arnoldToolNames = [
  "activate_plan",
  "add_exercise_to_workout",
  "add_set_to_exercise",
  "display_workout_plan",
  "get_active_plan",
  "get_exercise_guide",
  "get_open_workout_session",
  "get_plans",
  "get_user_profile",
  "get_workouts_history",
  "list_exercise_notes",
  "remove_exercise_from_workout",
  "remove_set_from_exercise",
  "remove_set_from_workout_session",
  "replace_exercise_in_workout",
  "search_exercises",
  "set_exercise_note",
  "set_workout_session_set_note",
  "update_set_recommendations",
  "update_user_profile",
  "show_exercises",
  "show_workout",
  "show_plan",
  "show_workout_session",
  "show_profile",
  "show_exercise_history",
  "show_weekly_goal",
  "show_lifetime_totals",
  "propose_plan",
  "get_plan",
  "get_exercise_history",
  "get_weekly_goal",
  "get_lifetime_totals",
] as const;

export type ArnoldToolName = (typeof arnoldToolNames)[number];

export const isArnoldCardId = (value: unknown): value is ArnoldCardId =>
  arnoldCardIds.some((id) => id === value);

export const isArnoldToolName = (value: unknown): value is ArnoldToolName =>
  arnoldToolNames.some((name) => name === value);

/**
 * What a send carries as eve's client context: the picked model (none →
 * Arnold's default) and the App language, plus the cards the build can draw
 * and the device's IANA time zone. A build that sends no `cards` is an old
 * build, which keeps today's tools.
 */
export interface ArnoldClientContext {
  cards?: readonly ArnoldCardId[];
  language: AppLanguage;
  model?: ArnoldModelId;
  timeZone?: string;
}
