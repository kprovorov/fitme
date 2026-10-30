import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { CoverList } from "../schemas";
import type { ServedLibrary } from "../served-library";
import { rateLimited, security, unauthorized } from "./shared";

const listCovers = createRoute({
  method: "get",
  path: "/covers",
  responses: {
    200: {
      content: { "application/json": { schema: CoverList } },
      description:
        "Every Cover, in the Library's order. Covers have no text, so there is no `language`.",
    },
    401: unauthorized,
    429: rateLimited,
  },
  security,
  summary: "List every Cover",
});

export const coverRoutes = (library: ServedLibrary) => {
  // parsing strips every field Cover doesn't define
  const body = CoverList.parse({ data: library.covers });
  return new OpenAPIHono().openapi(listCovers, (c) => c.json(body, 200));
};
