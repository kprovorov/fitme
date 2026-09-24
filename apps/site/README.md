# @fitme/site

Marketing site for Fitme (fitmeproject.com): landing page, blog, support, privacy policy and terms.

```bash
pnpm dev:site        # next dev on :3001
pnpm site build      # next build
```

Copy `.env.example` to `.env.local` and fill in the values.

- Blog posts are MDX files in `blog/` with `title`, `summary` and `publishedAt` frontmatter. The cover image lives at `public/blog/<publishedAt>.png`.
- `public/.well-known/apple-app-site-association` enables universal links for the iOS app.
- PostHog requests are proxied through `/ingest` (see `next.config.ts`).
