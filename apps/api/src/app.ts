import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { v1 } from "./routes/v1.js";

export const app = new Hono();

app.use(logger());
app.use(cors({ origin: "*" }));

app.get("/health", (c) => c.json({ ok: true }));

app.route("/v1", v1);

app.notFound((c) =>
  c.json({ error: { code: "not_found", message: "Route not found" } }, 404)
);

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json(
      { error: { code: "http_error", message: error.message } },
      error.status
    );
  }
  console.error(error);
  return c.json(
    { error: { code: "internal_error", message: "Internal server error" } },
    500
  );
});
