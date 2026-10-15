import {
  coachModels as allCoachModels,
  defaultCoachModelId,
} from "@fitme/core";
import { Hono } from "hono";

/** How long clients and the CDN may reuse the list, in seconds. */
const MAX_AGE_SECONDS = 300;

export const coachModels = new Hono();

// Public: the list isn't secret, and the Coach channel does the real gating.
coachModels.get("/", (c) => {
  c.header(
    "Cache-Control",
    `public, max-age=${MAX_AGE_SECONDS}, s-maxage=${MAX_AGE_SECONDS}`
  );
  return c.json({
    data: {
      defaultId: defaultCoachModelId,
      models: allCoachModels.map(({ description, id, label }) => ({
        description,
        id,
        label,
      })),
    },
  });
});
