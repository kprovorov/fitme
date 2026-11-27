/**
 * **The one way to send product analytics**: `analytics.send` an event,
 * `identify` the User, `reset` on sign-out and `screen` for a screen opened.
 * Every event is typed from `AnalyticsEvents`, the tracking plan: a name or a
 * property that isn't there fails the typecheck. It forwards to PostHog's
 * React Native SDK, of which it is the only importer, through one standalone
 * client (no PostHog provider in the tree, so no touch autocapture), and sends
 * nothing unless `shouldSendAnalytics` (`~/lib/analytics-decision`) says so.
 */
import type { Gender, MeasurementSystem } from "@fitme/core";
import { PostHog } from "posthog-react-native";
import type {
  PostHogCustomStorage,
  PostHogOptions,
} from "posthog-react-native";

import type { PlanSource } from "~/hooks/queries/plans";
import type { DiscardSource } from "~/hooks/queries/workout-sessions";
import {
  analyticsDecisionOverride,
  shouldSendAnalytics,
} from "~/lib/analytics-decision";
import { IS_E2E } from "~/lib/constants";
import { storage } from "~/lib/mmkv";
import type { PlanUpdateChangeKind } from "~/lib/plan-changes";

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

/** The options the client is built with; the fake SDK records them. */
export type AnalyticsClientOptions = PostHogOptions;

/**
 * The SDK's state (its ids and the queue of events not sent yet) in the app's
 * own MMKV instance, rather than in a file of its own.
 */
const mmkvStorage: PostHogCustomStorage = {
  getItem: (key) => storage.getString(key) ?? null,
  setItem: (key, value) => {
    storage.set(key, value);
  },
};

const clientOptions = (host: string | undefined): AnalyticsClientOptions => ({
  // Application Installed, Updated, Opened, Became Active and Backgrounded.
  captureAppLifecycleEvents: true,
  customStorage: mmkvStorage,
  enableSessionReplay: false,
  // Sentry reports the app's errors.
  errorTracking: { autocapture: false },
  // Unset: the SDK's own default host.
  host: host || undefined,
  preloadFeatureFlags: false,
});

const posthogKey = (): string => process.env.EXPO_PUBLIC_POSTHOG_KEY ?? "";

const sends = (): boolean =>
  posthogKey() !== "" &&
  (analyticsDecisionOverride() ??
    shouldSendAnalytics({
      hasKey: true,
      isDevelopment: __DEV__,
      isE2E: IS_E2E,
    }));

let built: { client: PostHog; key: string } | null = null;

/**
 * The one client, built on first use and only while the app sends: never
 * without a key, which the SDK logs as an error (a red toast in a dev build).
 * Rebuilt only if the key changes, which happens in tests alone.
 */
const client = (): PostHog | null => {
  if (!sends()) {
    return null;
  }

  const key = posthogKey();

  if (built?.key !== key) {
    built = {
      client: new PostHog(
        key,
        clientOptions(process.env.EXPO_PUBLIC_POSTHOG_HOST)
      ),
      key,
    };
  }

  return built.client;
};

/** Properties as the SDK's `capture` and `identify` take them. */
type SdkProperties = Parameters<PostHog["capture"]>[1];

/**
 * Properties or traits as the SDK takes them: its properties type
 * declares an index signature, which no object type alias of ours gets
 * implicitly.
 */
const asProperties = (
  values: AnalyticsEvents[AnalyticsEventName] | AnalyticsTraits
): SdkProperties =>
  // SAFETY: every property and trait type above holds only strings, numbers,
  // booleans or undefined, each a JSON value.
  values as SdkProperties;

export const analytics = {
  identify: (userId: string, traits: AnalyticsTraits): Promise<void> => {
    client()?.identify(userId, asProperties(traits));

    return Promise.resolve();
  },

  reset: (): Promise<void> => {
    client()?.reset();

    return Promise.resolve();
  },

  /** A screen opened, by its name. */
  screen: (name: string): Promise<void> =>
    client()?.screen(name) ?? Promise.resolve(),

  send: <Name extends AnalyticsEventName>(
    name: Name,
    ...[properties]: EventArguments<Name>
  ): Promise<void> => {
    client()?.capture(name, asProperties(properties));

    return Promise.resolve();
  },
};

// Built at startup, not at the first event, so the app's lifecycle events
// (Application Opened among them) are captured from launch.
client();
