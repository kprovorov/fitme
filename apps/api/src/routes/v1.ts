import { Hono } from "hono";
import { clientConfig } from "./client-config.js";
import { coachModels } from "./coach-models.js";
import { muscleGroups } from "./muscle-groups.js";

export const v1 = new Hono();

v1.route("/client-config", clientConfig);
v1.route("/coach/models", coachModels);
v1.route("/muscle-groups", muscleGroups);
