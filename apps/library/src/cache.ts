import { createMiddleware } from "hono/factory";

/** Devices reuse an answer for an hour, then revalidate. */
const CACHE_CONTROL = "private, max-age=3600";

const WEAK_PREFIX = /^W\//u;

/** Whether an `If-None-Match` header lists `etag` (weak comparison) or is `*`. */
const matches = (ifNoneMatch: string | undefined, etag: string) =>
  ifNoneMatch
    ?.split(",")
    .map((tag) => tag.trim())
    .some((tag) => tag === "*" || tag.replace(WEAK_PREFIX, "") === etag) ??
  false;

/**
 * Lets devices cache successful content responses: `Cache-Control` (private:
 * content is for authenticated callers and must never sit in a shared cache)
 * and the Library hash as the `ETag`. A request whose
 * `If-None-Match` matches gets `304 Not Modified` with the 200's headers but
 * no body. Errors stay uncacheable.
 */
export const deviceCache = (libraryHash: string) => {
  const etag = `"${libraryHash}"`;

  return createMiddleware((c, next) =>
    next().then(() => {
      if (c.res.status !== 200) {
        return c.res;
      }

      const headers = { "Cache-Control": CACHE_CONTROL, ETag: etag };

      if (matches(c.req.header("If-None-Match"), etag)) {
        c.res = new Response(null, { headers, status: 304 });

        return c.res;
      }

      for (const [name, value] of Object.entries(headers)) {
        c.res.headers.set(name, value);
      }

      return c.res;
    })
  );
};
