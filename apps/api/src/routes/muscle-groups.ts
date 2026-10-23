import {
  muscleGroups as allMuscleGroups,
  muscleGroupToName,
} from "@fitme/core";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { ErrorResponse, invalidRequest, MuscleGroup } from "../schemas.js";

const MuscleGroupItem = z
  .object({
    id: MuscleGroup,
    name: z.string().openapi({ example: "Chest" }),
  })
  .openapi("MuscleGroupItem");

const listMuscleGroups = createRoute({
  method: "get",
  path: "/",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ data: z.array(MuscleGroupItem) }),
        },
      },
      description: "Every muscle group",
    },
  },
  summary: "List muscle groups",
});

const getMuscleGroup = createRoute({
  method: "get",
  path: "/{muscleGroup}",
  request: { params: z.object({ muscleGroup: MuscleGroup }) },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ data: MuscleGroupItem }) },
      },
      description: "The muscle group",
    },
    404: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "No such muscle group",
    },
  },
  summary: "Get one muscle group",
});

export const muscleGroups = new OpenAPIHono({ defaultHook: invalidRequest })
  .openapi(listMuscleGroups, (c) =>
    c.json(
      {
        data: allMuscleGroups.map((muscleGroup) => ({
          id: muscleGroup,
          name: muscleGroupToName(muscleGroup),
        })),
      },
      200
    )
  )
  .openapi(
    getMuscleGroup,
    (c) => {
      const { muscleGroup } = c.req.valid("param");
      return c.json(
        { data: { id: muscleGroup, name: muscleGroupToName(muscleGroup) } },
        200
      );
    },
    // An unknown muscle group is a missing resource, not an invalid request.
    (result, c) => {
      if (!result.success) {
        return c.json(
          { error: { code: "not_found", message: "Unknown muscle group" } },
          404
        );
      }
    }
  );
