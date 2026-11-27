/**
 * **The one way to send product analytics**: `analytics.send` an event,
 * `identify` the User, `reset` on sign-out and `screen` for a screen opened.
 * Every event is typed from `AnalyticsEvents`, the tracking plan: a name or a
 * property that isn't there fails the typecheck. It forwards to the Segment
 * client (`~/lib/segment`) for now, and sends nothing unless
 * `shouldSendAnalytics` (`~/lib/analytics-decision`) says so.
 */
import type { Gender, MeasurementSystem } from "@fitme/core";
import type { JsonMap } from "@segment/analytics-react-native";

import type { PlanSource } from "~/hooks/queries/plans";
import type { DiscardSource } from "~/hooks/queries/workout-sessions";
import {
  analyticsDecisionOverride,
  shouldSendAnalytics,
} from "~/lib/analytics-decision";
import { IS_E2E } from "~/lib/constants";
import type { PlanUpdateChangeKind } from "~/lib/plan-changes";
import { segmentClient } from "~/lib/segment";

/** The Plan Update a finished Workout Session offered (`planUpdateProperties`). */
interface PlanUpdateProperties {
  plan_id: string | undefined;
  workout_id: string | undefined;
  workout_session_id: string;
}

/** How many changes of each kind it offered (`countPlanChanges`). */
type PlanChangeCounts = Record<PlanUpdateChangeKind | "remove_sets", number>;

/** What a Note is on: an Exercise, or a logged set. Never the note's text. */
type NoteTarget = "exercise" | "set";

/**
 * Every event the app sends, with its properties (`undefined` for none).
 * The names and property names are the ones already in the history, kept
 * exactly as they are (ADR 0026): `exercise_id` holds a Workout Session
 * Exercise's id and `weight_unit` the measurement system.
 */
export interface AnalyticsEvents {
  "Arnold Attachment Sent": { count: number };
  "Exercise Added": { exercise_slug: string; session_id: string };
  "Exercise Deleted": { exercise_id: string; session_id: string };
  "Exercise Replaced": { exercise_slug: string; session_id: string };
  "Note Cleared": { target: NoteTarget };
  "Note Saved": { target: NoteTarget };
  "Plan Activated": { plan_id: string };
  "Plan Deleted": { plan_id: string };
  "Plan Edited": { plan_id: string };
  "Plan Saved": { plan_id: string; source: PlanSource };
  "Plan Update Accepted": PlanUpdateProperties;
  "Plan Update Declined": PlanUpdateProperties;
  "Plan Update Suggested": PlanChangeCounts & PlanUpdateProperties;
  "Profile Filled": {
    age: number;
    gender: Gender;
    weight_unit: MeasurementSystem;
  };
  "Set Removed": { exercise_id: string; logged: boolean; session_id: string };
  "Set Tracked": { exercise_id: string; reps: number; weight: number };
  "User Deleted Account": undefined;
  "User Logged In": undefined;
  "User Logged Out": undefined;
  "User Registered": undefined;
  "Workout Discarded": { logged_set_count: number; source: DiscardSource };
}

export type AnalyticsEventName = keyof AnalyticsEvents;

/** An event's properties as `send`'s arguments: none for an event without. */
type EventArguments<Name extends AnalyticsEventName> =
  AnalyticsEvents[Name] extends undefined
    ? []
    : [properties: AnalyticsEvents[Name]];

/** What the User is known by, beside their id. */
export interface AnalyticsTraits {
  email?: string;
  name?: string;
}

const sends = (): boolean =>
  analyticsDecisionOverride() ??
  shouldSendAnalytics({
    hasKey: Boolean(process.env.EXPO_PUBLIC_SEGMENT_WRITE_KEY),
    isDevelopment: __DEV__,
    isE2E: IS_E2E,
  });

const nothing = (): Promise<void> => Promise.resolve();

/**
 * Properties or traits as the SDK takes them. Its `JsonMap` also declares a
 * number index signature, which no object type alias of ours gets implicitly.
 */
const asJson = (
  values: AnalyticsEvents[AnalyticsEventName] | AnalyticsTraits
): JsonMap | undefined =>
  // SAFETY: every property and trait type above holds only strings, numbers,
  // booleans or undefined, each a `JsonValue`.
  values as JsonMap | undefined;

export const analytics = {
  identify: (userId: string, traits: AnalyticsTraits): Promise<void> =>
    sends() ? segmentClient.identify(userId, asJson(traits)) : nothing(),

  reset: (): Promise<void> => (sends() ? segmentClient.reset() : nothing()),

  /** A screen opened, by its name. */
  screen: (name: string): Promise<void> =>
    sends() ? segmentClient.screen(name) : nothing(),

  send: <Name extends AnalyticsEventName>(
    name: Name,
    ...[properties]: EventArguments<Name>
  ): Promise<void> =>
    sends() ? segmentClient.track(name, asJson(properties)) : nothing(),
};
