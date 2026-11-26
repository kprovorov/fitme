import { initObservability, reportMissingEnv } from "@fitme/observability/node";

import { REQUIRED_ENV } from "./required-env.js";

initObservability({ service: "jobs" });

// On production, a lost env variable is reported before any run fails on it.
await reportMissingEnv(REQUIRED_ENV);

// Loaded only now, so pg and the rest are imported after observability has
// started and get instrumented (a static import would load them first).
const { createHandler } = await import("./create-handler.js");

const { forgottenWorkoutSessions } =
  await import("./jobs/forgotten-workout-sessions.js");

const { FORGOTTEN_WORKOUT_SESSIONS_MONITOR } = await import("./monitors.js");

// The private function Vercel Schedules calls (api/forgotten-workout-sessions.js).
export const POST = createHandler(
  forgottenWorkoutSessions(),
  FORGOTTEN_WORKOUT_SESSIONS_MONITOR
);
