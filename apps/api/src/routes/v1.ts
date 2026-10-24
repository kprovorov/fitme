import { OpenAPIHono } from "@hono/zod-openapi";
import type { ApiEnv } from "../auth.js";
import { invalidRequest } from "../schemas.js";
import { arnoldModelsRoute, legacyCoachModelsRoute } from "./arnold-models.js";
import { clientConfig } from "./client-config.js";
import { muscleGroups } from "./muscle-groups.js";
import { plans } from "./plans.js";
import { profile } from "./profile.js";
import { workoutSessionSets } from "./workout-session-sets.js";
import { workoutSessions } from "./workout-sessions.js";

/** The global routes, served without a caller. */
export const publicV1 = new OpenAPIHono({ defaultHook: invalidRequest });

publicV1.route("/arnold/models", arnoldModelsRoute);
publicV1.route("/client-config", clientConfig);
publicV1.route("/coach/models", legacyCoachModelsRoute);
publicV1.route("/muscle-groups", muscleGroups);

/** The User-data routes: mounted after auth, so each has a verified caller. */
export const userV1 = new OpenAPIHono<ApiEnv>({ defaultHook: invalidRequest });

userV1.route("/plans", plans);
userV1.route("/profile", profile);
userV1.route("/workout-session-sets", workoutSessionSets);
userV1.route("/workout-sessions", workoutSessions);
