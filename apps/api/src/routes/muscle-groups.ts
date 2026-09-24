import {
  muscleGroups as allMuscleGroups,
  muscleGroupToName,
} from "@fitme/core";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

const muscleGroupSchema = z.object({
  muscleGroup: z.enum(allMuscleGroups),
});

export const muscleGroups = new Hono();

muscleGroups.get("/", (c) =>
  c.json({
    data: allMuscleGroups.map((muscleGroup) => ({
      id: muscleGroup,
      name: muscleGroupToName(muscleGroup),
    })),
  })
);

muscleGroups.get(
  "/:muscleGroup",
  zValidator("param", muscleGroupSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: { code: "not_found", message: "Unknown muscle group" } },
        404
      );
    }
  }),
  (c) => {
    const { muscleGroup } = c.req.valid("param");
    return c.json({
      data: { id: muscleGroup, name: muscleGroupToName(muscleGroup) },
    });
  }
);
