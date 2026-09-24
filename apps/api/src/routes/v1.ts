import { Hono } from "hono";
import { muscleGroups } from "./muscle-groups.js";

export const v1 = new Hono();

v1.route("/muscle-groups", muscleGroups);
