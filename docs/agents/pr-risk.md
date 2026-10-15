# PR Risk

Pull requests to `main` carry a risk label so the maintainer knows how closely to review them. The label is a signal for review attention only: nothing merges, blocks or gates on it.

## Terms

- **PR Risk**: how much harm merging a pull request could cause if it turns out to be wrong. It is judged by blast radius and reversibility (a one-way or two-way door) and discounted by test coverage. It is about consequences, not size or difficulty. _Avoid_: PR size, complexity, priority.
- **Protected Path**: a path where a wrong change is costly or hard to undo. The list lives in `.github/labeler.yml` and nowhere else. _Avoid_: critical files, sensitive paths.

## Labels

| Label         | Meaning                                    | Set by   |
| ------------- | ------------------------------------------ | -------- |
| `risk:high`   | Wrong merge is costly or hard to undo      | Workflow |
| `risk:medium` | Wrong merge hurts some Users, but undoably | Hand     |
| `risk:low`    | Wrong merge is cheap to notice and undo    | Hand     |

## How `risk:high` is set

`.github/workflows/pr-risk.yml` runs `actions/labeler` on every pull request to `main` (opened, pushed to, reopened, retargeted to `main`; drafts included). It adds `risk:high` when any changed file matches a Protected Path glob in `.github/labeler.yml`, and removes it once none does. The workflow owns that label: adding or removing it by hand is overwritten on the next push, so to disagree with it, change the Protected Path list (itself a Protected Path, under `.github`). It never touches `risk:medium` or `risk:low`, so a hand-set one can sit next to `risk:high`; clearing it is on the maintainer.

The workflow runs on `pull_request_target`, so it and the Protected Path list always come from `main`: a pull request that changes either is labeled by the version on `main`, not its own. It never checks out or runs pull request code, which is what makes fork pull requests safe.

Known gap: the labeler matches only a changed file's new name, so renaming a Protected Path file to an unprotected path doesn't label the pull request. Watch for renames out of protected directories.
