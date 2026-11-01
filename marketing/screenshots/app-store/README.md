# App Store screenshots

The approved App Store screenshots: one Screenshot set per device size and
Listing locale, committed as plain numbered PNGs. The folders are the only
definition of each set; nobody writes screenshot paths into
`apps/mobile/store.config.json` by hand.

The [App Store screenshots shipped from the repo](https://linear.app/provorov/project/app-store-screenshots-shipped-from-the-repo-b89e8a9bd811)
project holds the full spec. Built so far: the check below (each Screenshot
set on its own, the folders against the listing config, and, against a base
Git ref, deleted Screenshot sets), `prepare`, which stages the sets for upload,
and both releases pushing them to the tagged version's draft: release CI (see
[Release](#release)) and the local release fallback
(`scripts/release-ios-local.sh`, see [Local release](#local-release)). The
check runs on pull requests and before every release build (see
[Where the check runs](#where-the-check-runs)).

The bare and framed captures in `../iphone/` and `../framed/` are source
material, not approved App Store exports; see [their README](../README.md).

## Layout

```text
app-store/
  iphone-6.9/        device folder
    en-US/           Listing locale, App Store Connect's own code
      01.png
      02.png
      ...
    uk/
      01.png
      ...
```

- **Device folders** map to an Apple display type and one exact size, through
  the device table in [`scripts/app-store-screenshots.mjs`](../../../scripts/app-store-screenshots.mjs).
  It has one entry: `iphone-6.9` → `APP_IPHONE_67`, 1320×2868 portrait. Any
  other folder name fails. A new device size (another iPhone, an iPad) is a new
  table entry and a new folder, once the pinned EAS CLI's Apple utilities know
  its display type.
- **Listing locale folders** use App Store Connect's codes, the same keys as
  the listing config (`en-US`, `uk`, never `uk-UA`). There is no mapping
  between folder names and Apple's names. Every device folder needs an `en-US`
  Screenshot set; every other Listing locale's folder is optional, since Apple
  shows the primary language's screenshots for a localization without its own.
- **Images** are named `01.png`, `02.png`, … with no gaps: the number is the
  display order. A Screenshot set holds one to ten images, and Listing locales
  may hold different numbers.

## Replacing an image

Overwrite the file, keeping its name. Add an image by giving it the next
number; to remove or reorder, renumber the rest so the numbering stays
`01.png` upward with no gaps.

Never delete a Screenshot set's folder to take its screenshots down: the
upload never clears a remote set, so they would stay online (see
[Deleted Screenshot sets](#deleted-screenshot-sets)).

Repo files keep their `NN.png` names even when their contents change:
[`prepare`](#staging-for-upload) uploads each image under a name derived from
its contents, so a replaced image always replaces the remote one, even at the
same byte size, and an unchanged one is left alone.

## The check

```sh
node scripts/app-store-screenshots.mjs check
```

It checks every Screenshot set under this directory (or the directory given
after `check`) against the Store listing config `apps/mobile/store.config.json`
(or the file given with `--config`), with no network and no secrets, and never
resizes or repairs anything. Every problem is reported, not just the first,
each naming the device, Listing locale, file or config key and the broken
rule; any problem exits 1. The rules:

- Every folder here is a device folder in the device table (this README aside),
  and every entry in a device folder is a Listing locale folder.
- Every Listing locale folder is a Listing locale of the listing config (a key
  of its `apple.info`). A folder for a locale the config doesn't list fails,
  `uk-UA` included; a locale the config lists without a folder is fine.
- Every device folder has an `en-US` Screenshot set.
- The listing config carries no `screenshots` entry anywhere: the folders are
  the only definition of the Screenshot sets, and release writes those entries
  into its own copy. A hand-written one fails, named by its key
  (`apple.info.en-US.screenshots`). A listing config that's missing, isn't
  JSON or has no `apple.info` object fails too.
- A Screenshot set holds only images named `01.png` upward with no gaps
  (`1.png`, `03a.png`, `03.PNG`, a text file or a subfolder fail), one to ten
  of them; an empty set fails. Finder's `.DS_Store` files are ignored (Git
  ignores them too).
- Each image fully decodes as a PNG: the right signature, every chunk's CRC,
  and all of its image data, so a renamed JPEG or a truncated file fails.
- Each image is exactly its device's size in portrait (1320×2868 for
  `iphone-6.9`); a landscape image is named as such.
- No alpha channel, even a fully opaque one, and no transparency (a `tRNS`
  chunk, which an RGB or palette PNG can carry without an alpha channel).
  Export the images flattened.

### Deleted Screenshot sets

```sh
node scripts/app-store-screenshots.mjs check --base origin/main
```

Given a base Git ref (`--base`, a pull request's base), the check also fails
for every Screenshot set folder that is in the base but gone now (deleted, or
renamed: `uk` to `uk-UA` deletes `uk`) while its Listing locale is still a key
in the listing config (`apps/mobile/store.config.json`, or the file given with
`--config`), naming the device and Listing locale. The pinned EAS CLI skips a
set with no entries instead of clearing it, so the screenshots already
uploaded for it would stay online as they are. Instead:

- to change what the set shows, replace its images (it must keep at least one);
- to stop managing that Listing locale's screenshots, remove the Listing locale
  from the listing config in the same pull request, deliberately: its listing
  text then stops being pushed too.

A base ref the check can't read (unknown, not fetched, or the directory isn't
in a Git work tree) fails the check, never skips the rule. Without `--base`
(local runs, release) the rule doesn't run.

Its tests (`scripts/app-store-screenshots.test.mjs`, run by
`pnpm test:scripts`) run the script on PNGs they generate, with a temporary
listing config (one test reads the repo's own), and the deleted set rule in
temporary Git repos.

### Where the check runs

- **Locally**, with the command above.
- **On pull requests** touching this directory, `apps/mobile/store.config.json`
  or the script and its tests: the App Store Screenshots workflow
  (`.github/workflows/app-store-screenshots.yml`) runs
  `check --base <the pull request's base commit>`, so the deleted set rule runs
  there (the workflow fetches the whole history for it). It needs no secrets and
  contacts no Apple service. Its tests run in the Shell Scripts workflow.
- **Before every release build**: the Build Mobile workflow's `build` job runs
  `check` (no base, so no deleted set rule) on the tagged checkout before
  `eas build` starts, so bad screenshots fail the release before a build is
  spent. A tag that predates the script skips the check and rebuilds as before.
- **In the local release fallback**, the same way before it builds (see
  [Local release](#local-release)).

Both run the script as it is in the checkout, so a rule added to it later runs
there with no workflow change.

## Staging for upload

```sh
node scripts/app-store-screenshots.mjs prepare <staging dir> [dir] [--config <file>]
```

Release runs this before `eas metadata:push`, in CI (see [Release](#release))
and in the local release script (see [Local release](#local-release)). It runs
the check above without a base
ref (the deleted set rule is the pull request's; `prepare` takes no `--base`),
and also refuses a Listing locale with a Screenshot set whose listing text in
the config isn't an object, since there'd be nowhere to put its entry. On any
problem it exits 1 and writes nothing: no staged file, the config untouched.
Otherwise it:

- copies each image to `<staging dir>/<device>/<Listing locale>/NN-<first 8
  hex of its sha256>.png`. That basename is the upload identity: EAS keeps a
  remote screenshot whose basename and byte size match, so an unchanged image
  keeps its name (and stays online, not re-uploaded), and a replaced one gets
  a new name and replaces the remote one, even at the same byte size;
- then writes the listing config's `screenshots` entries from the folders: for
  each Listing locale with a Screenshot set, the device table's display type
  mapped to the staged paths in numeric order, relative to the config's
  directory (the mobile app's, which EAS resolves them from). Listing locales
  and devices without a folder get no entry, so EAS leaves their remote
  screenshots alone. Everything else in the config stays as it was.

Without any Screenshot sets it stages nothing and leaves the config as it is,
text only. It rewrites the config in place, so the check (and a second
`prepare`) then refuses its entries as hand-written: after a local run, put the
config back with `git checkout apps/mobile/store.config.json`, and never commit
the entries. Same images, same names: a re-run from a fresh checkout stages
exactly what the last one did.

## Release

Screenshots only change through a release, and only to the release's own tag:
a later commit never reaches an earlier version. Release CI
([`build-mobile.yml`](../../../.github/workflows/build-mobile.yml)) uploads them
in its `listing` job, which starts once the `build` job's EAS build has been
submitted to App Store Connect, so the tagged version's draft exists. On the
tag's checkout it:

1. stamps the tag's version into the listing config (`apple.version`);
2. runs `prepare` into the runner's temp directory, outside the checkout. Any
   problem fails the job there, before anything is pushed. The staged files
   and the written `screenshots` entries live only on that runner: never
   committed, never uploaded as a workflow artifact;
3. runs `eas metadata:push --profile production --non-interactive` with the
   App Store Connect submission key stored in EAS, the same key that pushes the
   listing text (no other credential).

Each Screenshot set in the tag is then authoritative for its Listing locale and
device in the draft: images added, replaced (a new upload name), removed and
reordered to match the folder. Listing locales and devices without a folder get
no entry, so their remote screenshots stay as they are. Nothing is submitted
for App Review. A tag without Screenshot sets pushes its listing text only, and
one that predates this script (no `scripts/app-store-screenshots.mjs`) pushes
exactly what it pushed before.

**A successful run** means the sets passed the check before the upload and
`metadata:push` exited 0. Nothing reads the draft back from App Store Connect,
and EAS warns rather than fails on an image it skipped, so look at the draft
(every configured Listing locale: image count, images and order) before
submitting the version for review. If the push is refused for permissions, the
stored key needs an Account Holder, Admin, App Manager or Marketing role (App
Store Connect → Users and Access → Integrations).

**To retry** a failed push, open the release's Build Mobile run and use "Re-run
failed jobs" (or re-run the `listing` job alone). It checks the same tag out
again and runs no EAS build or submission, so no build quota or build number is
spent. That's safe after a half-done upload: unchanged images keep their upload
names, so the screenshots that already arrived are kept and only the rest are
uploaded.

## Local release

When the EAS build quota is used up, `scripts/release-ios-local.sh [vX.Y.Z]`
releases from a Mac (see AGENTS.md, CI/CD), from a tag on `origin/main` only.
On the checked-out tag it runs the tag's own copy of this script, as release CI
does:

- `check` before `pnpm install` and the local build, so bad screenshots fail
  the release before a build is spent;
- after `eas submit`, it stamps the tag's version into `app.json` and the
  listing config's `apple.version`, runs `prepare` into a temporary directory
  outside the repo, and runs `eas metadata:push --profile production
  --non-interactive` through the pinned CLI (`npx eas-cli@27.2.0`, whatever
  global `eas` the Mac has), pushing the listing text and the Screenshot sets
  to the submitted version's draft.

A tag without the listing config skips the push; a tag without this script
pushes the listing text only. A failed push leaves the submitted build alone
and prints how to retry just the push:
`scripts/release-ios-local.sh --listing-only vX.Y.Z` (no build or submit).
Either way the script deletes the staging directory and puts the stamped files
and the branch back, so the checkout is clean afterwards.

## How EAS CLI 27.2.0 uploads screenshots

The design above is built around the pinned CLI's screenshot behaviour, found
in FIT-500: it keeps a remote image whose basename and byte size match, deletes
the rest of a configured set, uploads, reorders, skips a missing file with a
warning after deleting, and never clears a set from an empty or absent entry.
The details, sources and authentication are in the marketing screenshots
README's [App Store upload](../README.md#app-store-upload) section.
