# Secrets

Every env var an app reads, secret or public config, lives in Infisical: the project **Fitme** in the `provorovcom` organization, whose id is in the committed `.infisical.json` (an id, not a credential: every read needs a logged-in member), so the CLI run anywhere in the repo uses it without `--projectId`. Vercel and the local env files are copies of it, never edited by hand. The variables themselves are documented in `AGENTS.md` (Environment Variables); this file is about where they live and how they move.

## Layout

Two environments: `dev` (local development, the values in the local env files, and CI's repository secrets) and `prod` (the Vercel Production deployments and the release workflows). `staging` is unused.

One folder per app, the same in both environments. A value two apps share sits at the folder root and each app's folder references it (`${prod.LIBRARY_ARNOLD_SECRET}`, `${prod.FITME_DATABASE_URL_BASE}?application_name=api`), so it changes in one place.

| Folder      | App              | Local file                  | Vercel project   | Sync            |
| ----------- | ---------------- | --------------------------- | ---------------- | --------------- |
| `/Api`      | `apps/api`       | `apps/api/.env`             | `fitme-api`      | `api-sync`      |
| `/Arnold`   | `apps/arnold`    | `apps/arnold/.env.local`    | `fitme-arnold`   | `arnold-sync`   |
| `/Library`  | `apps/exercises` | `apps/exercises/.env`       | `fitme-library`  | `library-sync`  |
| `/Mcp`      | `apps/mcp`       | `apps/mcp/.env`             | `fitme-mcp`      | `mcp-sync`      |
| `/Mobile`   | `apps/mobile`    | `apps/mobile/.env`          | (EAS, not synced)| none            |
| `/Site`     | `apps/site`      | `apps/site/.env.local`      | `fitme-site`     | `site-sync`     |
| `/Web`      | `apps/web`       | `apps/web/.env.local`       | `fitme-web`      | `web-sync`      |
| `/Webhooks` | `apps/webhooks`  | `apps/webhooks/.env`        | `fitme-webhooks` | `webhooks-sync` |
| `/GitHub`   | GitHub Actions   | none                        | none             | `github-repo-sync` (`dev`), `github-production-sync` (`prod`) |

`/GitHub` follows the environments too: `dev` `/GitHub` holds what CI uses against the development side (`CLERK_DEV_SECRET_KEY`, `SUPABASE_ACCESS_TOKEN`) and syncs to the repository secrets; `prod` `/GitHub` holds the release credentials (`EXPO_TOKEN`, `LINEAR_ACCESS_KEY`) and syncs to the GitHub `production` environment, which only the release and mobile build workflows use. `SUPABASE_ACCESS_TOKEN` is only for the E2E workflow and must be a scoped personal access token, never a classic one: **Development Branches** read-write (create, get, list, delete the preview branch), **API Keys** read (`branches get`), **Auth Config** read-write (the branch's Clerk third-party auth) and **Database** read-write (`/database/query`: migrations and the `fitme` password), on the organization (each preview branch is a new project, which a project-scoped token may not reach). Database read-write still reaches the production database, so treat it as a production credential. It stays a repository secret because E2E runs from feature branches and the `production` environment only allows `main` and `v*` tags. GitHub can't export a secret, so each goes into Infisical by hand (or is regenerated); until then GitHub keeps its own value. The GitHub syncs (through the `github` App Connection) run like the Vercel ones: `overwrite-destination`, no deletion, subfolders not included. `CLERK_DEV_SECRET_KEY` is synced already.

`prod` root holds the shared values: the Clerk production keys (`CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_JWT_KEY`) and the development instance's `CLERK_JWT_KEY_DEVELOPMENT`, `FITME_DATABASE_URL_BASE` (the `fitme` login's pooler URL without `application_name`), `EXERCISES_URL`, the server secrets the Library API accepts (`LIBRARY_ARNOLD_SECRET`, `LIBRARY_MCP_SECRET`), `ARNOLD_RESET_SECRET` and `EXERCISES_API_SECRET`.

The Public API, Arnold and MCP read `LIBRARY_URL` and their `LIBRARY_*` secret (`LIBRARY_PUBLIC_API_SECRET`, `LIBRARY_ARNOLD_SECRET`, `LIBRARY_MCP_SECRET`) and nothing else; the Library API itself still reads its `EXERCISES_*` secrets until its own rename. Until the old names are removed, the app folders carry both: the `LIBRARY_*` secrets at the root, and the `EXERCISES_*` names as references to them.

## Vercel syncs

Each `prod` app folder syncs to its Vercel project's Production environment through the `vercel-api-token` App Connection (team `provorovcom`), with auto-sync on, so an edit in Infisical reaches Vercel within seconds. A Vercel deployment reads its env when it builds, so **a change only takes effect on the app's next deployment**: redeploy it.

Every sync uses:

- **Initial sync behavior `overwrite-destination`, never an import.** Vercel doesn't return Sensitive values, so an import brings them into Infisical empty, and the sync then writes the empty value back over the real one. That is how `arnold-sync` (created with `import-prioritize-source`) blanked Arnold's `CLERK_JWT_KEY` and took Arnold down on 2026-10-25. Put every value into Infisical first, then create the sync.
- **`disableSecretDeletion: true`.** A sync only writes the keys its folder has and leaves every other variable alone. So the variables integrations manage stay in Vercel and never go into Infisical: Sentry (`SENTRY_DSN`, `SENTRY_PROJECT`, `SENTRY_OTLP_TRACES_URL`, …, `NEXT_PUBLIC_SENTRY_DSN`), Upstash (`UPSTASH_*`, `REDIS_URL`), Vercel Blob (`BLOB_*`), Axiom (`NEXT_PUBLIC_AXIOM_INGEST_ENDPOINT`), the Supabase marketplace integration on `fitme-web` (`POSTGRES_*`, `SUPABASE_*`, `NEXT_PUBLIC_SUPABASE_*`) and Vercel's own `VERCEL_*`. The flip side: removing a key from Infisical doesn't remove it from Vercel; delete it there too.
- **Sensitive** on (variables can't be read back from Vercel), except `site-sync`, whose folder is public config only.

A synced variable that was Vercel's "encrypted" type is replaced by a new Sensitive one; one that spanned Production and Preview is split, and Preview keeps its own copy.

The `preview` environment is Vercel's Preview target. It holds only `/Api` `CLERK_JWT_KEY`, the development instance's key as a reference (`${prod.CLERK_JWT_KEY_DEVELOPMENT}`), synced by `api-preview-sync`. The Site's Preview copies of its public config stay in Vercel: the project is at its plan's 10 syncs, and they never change. Previews get no database URL or server secrets on purpose: there is no preview database, and a preview must never reach production data. Vercel's Development target (`vercel env pull`) isn't synced either (no sync left on the plan): `fitme-api`'s `CLERK_JWT_KEY` there is set by hand to the same value as `dev` `/Api`'s (`${prod.CLERK_JWT_KEY_DEVELOPMENT}`).

## Changing a value

1. Edit it in Infisical: the app's folder, or the root for a shared value. A new variable goes in the folder of every app that reads it, as a reference when it's shared.
2. Check the sync ran (`syncStatus` `succeeded` in the project's Secret Syncs).
3. Redeploy the affected Vercel projects, then check the app answers as expected.

Rotating a secret two apps share (a Library server secret, `ARNOLD_RESET_SECRET`) changes it on both at once, so redeploy both back to back.

## Local development

`scripts/pull-env.sh [--keep-existing] [environment]` (default `dev`) writes every app's local file from its folder, references expanded, mode 600, overwriting the files it writes (with `--keep-existing`, only the missing ones). It needs the Infisical CLI logged in (`infisical login`). `.t3/setup.sh` runs it with `--keep-existing` in every worktree (never the main checkout), then copies from the main checkout whatever it couldn't pull, then points the files at the worktree's own Supabase stack. A local value you change by hand is overwritten on the next pull: change it in Infisical `dev` instead.

## Not in Infisical yet

- The EAS `production` environment of `apps/mobile`: no Secret Sync exists for EAS.
