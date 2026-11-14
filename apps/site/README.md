# @fitme/site

Marketing site for Fitme (fitmeproject.com): landing page, blog, support, privacy policy and terms.

```bash
scripts/with-dev-env.sh Site -- pnpm dev:site   # next dev on :3001, with Infisical dev's /Site values (from the repo root)
pnpm site build      # next build
```

`.env.example` lists the variables it reads; their values come from Infisical `dev` `/Site` (see [Secrets](../../docs/agents/secrets.md)).

- Blog posts are MDX files in `blog/` with `title`, `summary` and `publishedAt` frontmatter. The cover image lives at `public/blog/<publishedAt>.png`.
- `public/.well-known/apple-app-site-association` enables universal links for the iOS app.
- PostHog requests are proxied through `/ingest` (see `next.config.ts`).
