import { randomUUID } from "node:crypto";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { call, connect } from "../src/__tests__/harness.js";
import {
  createSupabaseClientFromEnv,
  type FitmeSupabaseClient,
} from "../src/supabase.js";

/**
 * Helpers for the integration suite, which runs the MCP tools against a real
 * Supabase stack (`pnpm db start` + `pnpm db seed`). Users are created through
 * the public sign-up endpoint with the anon key, so every query goes through
 * the same RLS policies and RPCs as in production.
 */

const TEST_PASSWORD = "integration-test-password";

export function requireEnv() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!(url && anonKey)) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_ANON_KEY must point at a running Supabase stack (see apps/mcp/README.md, Integration tests)."
    );
  }
  return { anonKey, url };
}

export interface TestUser {
  accessToken: string;
  /** Auth client holding the user's session (e.g. to approve OAuth consent). */
  auth: SupabaseClient;
  /** Client acting as the user (anon key + their token), for fixtures. */
  supabase: FitmeSupabaseClient;
  userId: string;
}

/** Signs up a fresh user; needs email confirmations disabled (config.toml). */
export async function createTestUser(label: string): Promise<TestUser> {
  const { anonKey, url } = requireEnv();
  const auth = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await auth.auth.signUp({
    email: `mcp-${label}-${randomUUID()}@integration.test`,
    password: TEST_PASSWORD,
  });
  if (error) {
    throw new Error(`Sign-up failed: ${error.message}`);
  }
  if (!(data.session && data.user)) {
    throw new Error(
      "Sign-up returned no session: email confirmations must be disabled."
    );
  }

  const supabase = createSupabaseClientFromEnv(data.session.access_token);
  if (!supabase) {
    throw new Error("Could not build a Supabase client from the environment.");
  }
  return {
    accessToken: data.session.access_token,
    auth,
    supabase,
    userId: data.user.id,
  };
}

/** MCP client whose user tools run against the real stack as `user`. */
export const connectAs = (user: TestUser) =>
  connect({ accessToken: user.accessToken });

/** Calls a tool and returns its JSON payload, failing on `isError`. */
export async function callOk<T>(
  client: Client,
  name: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const outcome = await call(client, name, args);
  if (outcome.isError) {
    throw new Error(`${name} failed: ${outcome.text}`);
  }
  return outcome.json as T;
}

/** Calls a tool that must fail and returns its error text. */
export async function callError(
  client: Client,
  name: string,
  args: Record<string, unknown> = {}
): Promise<string> {
  const outcome = await call(client, name, args);
  if (!outcome.isError) {
    throw new Error(`${name} unexpectedly succeeded: ${outcome.text}`);
  }
  return outcome.text;
}

export interface ExerciseRow {
  id: string;
  muscle_groups: string[] | null;
  name: string;
}

export interface ExercisePage {
  exercises: ExerciseRow[];
  hasMore: boolean;
  total: number;
}

/** Two library exercises to build plans from (the library must be seeded). */
export async function pickExercises(client: Client) {
  const page = await callOk<ExercisePage>(client, "list_exercises", {
    limit: 2,
  });
  const [first, second] = page.exercises;
  if (!(first && second)) {
    throw new Error(
      "The exercise library is empty: seed it with `pnpm db seed`."
    );
  }
  return [first, second] as const;
}

export interface PlanSet {
  id: string;
  order: number;
  reps_recommended: number;
  rest_recommended: number;
  weight_recommended: number;
}

export interface PlanWorkout {
  exercises: {
    exercise: { id: string; name: string };
    id: string;
    order: number;
    sets: PlanSet[];
  }[];
  id: string;
  name: string;
  order: number;
}

export interface PlanDetail {
  description: string;
  id: string;
  is_active: boolean;
  name: string;
  note: string | null;
  workouts: PlanWorkout[];
}

export interface PlanSummary {
  id: string;
  is_active: boolean;
  name: string;
  workouts: { exercise_count: number; id: string; name: string }[];
}

export interface SessionSet {
  id: string;
  logged_at: string | null;
  order: number;
  reps_completed: number | null;
  reps_recommended: number;
  weight_completed: number | null;
  weight_recommended: number;
}

export interface SessionDetail {
  exercises: { exercise: { id: string }; id: string; sets: SessionSet[] }[];
  finished_at: string | null;
  id: string;
  plan: { id: string; name: string } | null;
  status: "finished" | "in_progress";
  workout: { id: string; name: string } | null;
}

export interface SessionPage {
  hasMore: boolean;
  sessions: {
    id: string;
    logged_set_count: number;
    set_count: number;
    status: string;
  }[];
  total: number;
}

/** A two-workout plan: Day A (both exercises), Day B (the second one). */
export const planInput = (
  [first, second]: readonly [ExerciseRow, ExerciseRow],
  name = "Integration plan"
) => ({
  description: "Created by the MCP integration suite",
  experience_level: "intermediate",
  frequency: 3,
  goal: "strength-performance",
  name,
  note: "Initial note",
  place: "gym",
  workout_duration: 60,
  workouts: [
    {
      description: "Day A focus",
      exercises: [
        {
          exercise_id: first.id,
          sets: [
            {
              reps_recommended: 8,
              rest_recommended: 90,
              weight_recommended: 60,
            },
            {
              reps_recommended: 6,
              rest_recommended: 120,
              weight_recommended: 65,
            },
          ],
        },
        {
          exercise_id: second.id,
          sets: [
            {
              reps_recommended: 10,
              rest_recommended: 60,
              weight_recommended: 20,
            },
          ],
        },
      ],
      name: "Day A",
    },
    {
      description: "Day B focus",
      exercises: [
        {
          exercise_id: second.id,
          sets: [
            {
              reps_recommended: 12,
              rest_recommended: 60,
              weight_recommended: 15,
            },
          ],
        },
      ],
      name: "Day B",
    },
  ],
});
