# PR Risk

Every pull request to `main` carries exactly one risk label so the maintainer knows how closely to review it. The label is a signal for review attention only: nothing merges, blocks or gates on it.

## Terms

- **PR Risk**: how much harm merging a pull request could cause if it turns out to be wrong. It is judged by blast radius and reversibility (a one-way or two-way door) and discounted by test coverage. It is about consequences, not size or difficulty. _Avoid_: PR size, complexity, priority.
- **Risk Path**: a path whose changes raise a pull request's PR Risk, with a tier: a **high Risk Path** (a wrong change is costly or hard to undo) or a **medium Risk Path** (it hurts some Users, but undoably). The list lives in `.github/risk-paths.yml` and nowhere else, with a `high` and a `medium` section. _Avoid_: Protected Path, critical files, sensitive paths.

## Labels

| Label         | Meaning                                    | Set by   |
| ------------- | ------------------------------------------ | -------- |
| `risk:high`   | Wrong merge is costly or hard to undo      | Workflow |
| `risk:medium` | Wrong merge hurts some Users, but undoably | Workflow |
| `risk:low`    | Wrong merge is cheap to notice and undo    | Workflow |

## How the label is set

`.github/workflows/pr-risk.yml` runs on every pull request to `main` (opened, pushed to, reopened, retargeted to `main`; drafts included). One `actions/github-script` step lists the changed files and labels the pull request:

- `risk:high` when any changed file matches a high Risk Path glob,
- otherwise `risk:medium` when any changed file matches a medium Risk Path glob,
- otherwise `risk:low`.

The highest tier wins, so tiers may overlap: medium uses broad globs (`packages/services/**`) that also cover the high files inside them. A renamed file counts under its previous name as well as its new one, so moving a high file to an unlisted path still labels the pull request high. A pull request with 3000 or more changed files (more than the API can list) is high without matching. Globs are Node's `path.matchesGlob`; files in dot directories (`.hidden/`, `.env.local`) inside a Risk Path match too. The pnpm lockfile is deliberately not a Risk Path: it follows a `package.json` change, which is medium, and transitive-only churn stays low.

The workflow owns all three labels: it adds the winning one and removes the other two in the same run, and never touches any other label. A risk label set or removed by hand is overwritten on the next push, so to disagree with it, change the Risk Path list (itself a high Risk Path, under `.github`). A failed run (an API error) shows a red check and leaves the labels as they were.

The workflow runs on `pull_request_target`, so it always comes from `main`, and it reads the Risk Path list from the pull request's base commit: a pull request that changes either is labeled by the version on `main`, not its own. It never checks out or runs pull request code (both the list and the changed files come through the API), which is what makes fork pull requests safe.
