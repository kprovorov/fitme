import { OpenAPIHono } from "@hono/zod-openapi";
import type { ApiEnv } from "../auth.js";
import { invalidRequest } from "../schemas.js";
import { clientConfig } from "./client-config.js";
import { coachModels } from "./coach-models.js";
import { muscleGroups } from "./muscle-groups.js";
import { profile } from "./profile.js";

/** The global routes, served without a caller. */
export const publicV1 = new OpenAPIHono({ defaultHook: invalidRequest });

publicV1.route("/client-config", clientConfig);
publicV1.route("/coach/models", coachModels);
publicV1.route("/muscle-groups", muscleGroups);

/** The User-data routes: mounted after auth, so each has a verified caller. */
export const userV1 = new OpenAPIHono<ApiEnv>({ defaultHook: invalidRequest });

userV1.route("/profile", profile);
