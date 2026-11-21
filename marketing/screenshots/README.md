# Fitme iOS marketing screenshots

## Captures

`iphone/` holds one set per App language, captured 2026-11-21: `en-US`, `uk-UA`, `es-ES`, `ca-ES`, `de-DE`, `fr-FR`, `it-IT`, `ja-JP`, `ko-KR`, `nl-NL`, `pl-PL`, `pt-BR`, `pt-PT`, `zh-Hans-CN` and `zh-Hant-TW`. Each set has the same ten scenes, and the matching `framed/` folders hold black Pro-style frames. Filenames describe the screen or state. The captures are 1206×2622; the framed PNGs are 1332×2748 with transparent backgrounds. The [capture manifest](capture-manifest-2026-11-21.json) lists every file with its SHA256, including the App Store exports.

The ten scenes are:

- Arnold generating a plan.
- Logging a set.
- A finished session with two PR trophies and a muscle map.
- Arnold changing a weight.
- Exercise progress.
- The next workout.
- The post-workout plan update.
- An exercise video and form tips.
- Workout history.
- Arnold's model picker.

These replace the earlier sets for two app updates: the new Library (ADR 0022), which changes exercise names and thumbnails in every scene and the redesigned exercise detail screen, and the new Profile button on Home.

### Locales

| Source folder | App language | Listing folder |
| ------------- | ------------ | -------------- |
| `en-US`       | `en`         | `en-US`        |
| `uk-UA`       | `uk`         | `uk`           |
| `es-ES`       | `es`         | `es-ES`        |
| `ca-ES`       | `ca`         | `ca`           |
| `de-DE`       | `de`         | `de-DE`        |
| `fr-FR`       | `fr`         | `fr-FR`        |
| `it-IT`       | `it`         | `it`           |
| `ja-JP`       | `ja`         | `ja`           |
| `ko-KR`       | `ko`         | `ko`           |
| `nl-NL`       | `nl`         | `nl-NL`        |
| `pl-PL`       | `pl`         | `pl`           |
| `pt-BR`       | `pt-BR`      | `pt-BR`        |
| `pt-PT`       | `pt-PT`      | `pt-PT`        |
| `zh-Hans-CN`  | `zh-Hans`    | `zh-Hans`      |
| `zh-Hant-TW`  | `zh-Hant`    | `zh-Hant`      |

### Device and build

- iPhone 18 Pro simulator, iOS 27.2, with a status-bar override: 9:41 (09:41 in 24-hour regions), full signal and a full battery.
- The Release build of this checkout. Its JavaScript bundle was rebuilt to carry the model picker fix (#697), so the picker shows all four models.
- The Polish finish scenes (`workout-summary-prs`, `next-workout`, `update-plan`) were recaptured with the plan update unit fix (#698) as well. Without it, "kg" wrapped onto a line of its own in Polish.
- Each locale was launched with its own `AppleLanguages` and `AppleLocale` (for example `pl-PL` / `pl_PL`), so dates and numbers follow that region. `en-US` uses US formatting.

### Demo data

- A dedicated Clerk development account on a local database, seeded with `seed/seed.sql`.
- The seed has seven weeks of history with a weekly goal of 4, so History shows the chart and a streak.
- Plan and workout names were translated per locale after seeding, and the workouts were given real Library Covers.
- The local API and Arnold served the new Library from a v2 bundle built from `fitme-library` (`LIBRARY_V2_BUNDLE`). Covers came from a legacy bundle (`LIBRARY_BUNDLE`), and media came from the Supabase `library` bucket.

### How each scene was made

- **Arnold scenes:** real model replies in each language. Arnold changed all four Upper A bench targets to 85 kg, and the database confirmed it each time.
- **PR scene:** the session's logged weights were raised in the database. The last set was then logged in the app and the workout finished there, so the trophies were awarded by the real finish.
- **Plan-update scene:** Barbell Squat was swapped for Front Squat in the app. The other sets were filled in the database, and the workout was finished in the app. "Keep plan as is" was chosen.

### Framing

The frames are drawn illustrations, not official device mockups. Generate them without resizing the source capture:

```sh
for locale in en-US uk-UA es-ES ca-ES de-DE fr-FR it-IT ja-JP ko-KR nl-NL pl-PL pt-BR pt-PT zh-Hans-CN zh-Hant-TW; do
  for f in marketing/screenshots/iphone/$locale/*.png; do
    python3 marketing/screenshots/frame.py "$f" "marketing/screenshots/framed/$locale/$(basename "$f")"
  done
done
```

The site's `apps/site/public/screens/` assets are separate exports and were not refreshed.

### App Store sets

All 15 Listing sets in `app-store/iphone-6.9/` were recomposed with `compose-app-store.py` from these framed captures. The captions did not change, so the caption inputs were cut from the previously approved exports: their area above y = 820 is kept byte for byte, and everything below is the flat background. All 150 images pass `node scripts/app-store-screenshots.mjs check`. Nothing was uploaded to App Store Connect.

### Known limits

- Arnold's wording and exercise choices differ between languages; the screen states match.
- Long Japanese exercise names can break before a trailing long-vowel mark.
- Long exercise names are cut with "…" in the PR summary rows (German, Dutch, Polish) and in the progress header (Dutch, Polish). This is the app's own truncation.
- On the next-workout card, the "+2" muscle badge drops onto a line of its own in Ukrainian, German and Polish.
- The App Store caption for scene 10 still says "GPT or Claude", but the picker now lists four models.

## App Store upload

The App Store frames in the Fitme Figma file (page AppStore Screenshots, sections App Store · v2.4.1 · EN / UK) show these framed PNGs: each frame's phone is an image layer named after its source (`iPhone · framed/<locale>/<scene>.png`), 962 px wide. To refresh one, reframe the capture, replace that layer's image, then export the frame at 1× and flatten it to RGB. Never redraw a phone around a bare `iphone/` capture: that shipped misaligned once. The full build-and-review rules, including checking each export's edges with `crop-edges.py`, are in [Making a Screenshot set](app-store/README.md#making-a-screenshot-set).

Spanish and Catalan use the same layout through a local composition: the Figma sections `App Store · ES · captions (local phones)` and `App Store · CA · captions (local phones)` retain editable localized captions, with the phone layers hidden. Export their ten frames at 1× as `01.png` through `10.png`, then combine those exports with the matching `framed/` captures:

```sh
python3 marketing/screenshots/compose-app-store.py /tmp/captions/es-ES \
  marketing/screenshots/framed/es-ES marketing/screenshots/app-store/iphone-6.9/es-ES
python3 marketing/screenshots/compose-app-store.py /tmp/captions/ca \
  marketing/screenshots/framed/ca-ES marketing/screenshots/app-store/iphone-6.9/ca
```

The compositor refuses a caption export with its phone still visible, preserves the existing 962 px phone placement, and writes flattened RGB PNGs. Captures are not uploaded to Figma. Source locale `ca-ES` maps to Listing locale `ca`; Spanish uses `es-ES` for both. The listing config includes public text for both locales, so the normal screenshot check and release staging recognize the new sets. No App Store Connect upload was performed for these additions.

The new 1206×2622 captures above are source material. They are not the 1320×2868 large-display exports discussed below; prepare and validate an appropriate App Store set separately before configuring an upload.

Approved App Store exports live separately in [`marketing/screenshots/app-store/`](app-store/README.md), one Screenshot set per device and Listing locale (`iphone-6.9/en-US/01.png`, …), checked by `node scripts/app-store-screenshots.mjs check`. That directory's README holds the layout, naming and check rules; the findings below on how the pinned EAS CLI uploads screenshots are what that design is built around.

**Yes: EAS CLI 27.2.0 supports screenshot uploads from `apps/mobile/store.config.json`.** Verified 2026-11-01 for FIT-500 against the tagged source. Support and non-interactive ASC API-key auth arrived in [18.5.0](https://github.com/expo/eas-cli/blob/v27.2.0/CHANGELOG.md#1850---2026-04-02); [18.6.0](https://github.com/expo/eas-cli/blob/v27.2.0/CHANGELOG.md#1860---2026-04-10) fixed asset uploads stuck in `AWAITING_UPLOAD`. Use 18.6.0 or later for that fix; this investigation verifies 27.2.0 specifically. Release CI pins **27.2.0** in [`build-mobile.yml`](../../.github/workflows/build-mobile.yml); `eas.json`'s `>= 27.2.0` is only a minimum. The [web schema reference](https://docs.expo.dev/eas/metadata/schema/) currently omits screenshots; the [27.2.0 schema](https://github.com/expo/eas-cli/blob/v27.2.0/packages/eas-cli/schema/metadata-0.json#L319-L328) includes them, and [`createAppleTasks`](https://github.com/expo/eas-cli/blob/v27.2.0/packages/eas-cli/src/metadata/apple/tasks/index.ts) registers `ScreenshotsTask` for the [upload pipeline](https://github.com/expo/eas-cli/blob/v27.2.0/packages/eas-cli/src/metadata/upload.ts).

The config shape the CLI reads, merged into the existing locale objects (the paths below are examples, not approved assets; the release staging will write these entries from the folders, never by hand):

```json
{
  "configVersion": 0,
  "apple": {
    "info": {
      "en-US": {
        "screenshots": {
          "APP_IPHONE_67": [
            "../../marketing/screenshots/app-store/iphone-6.9/en-US/01.png"
          ]
        }
      },
      "uk": {
        "screenshots": {
          "APP_IPHONE_67": [
            "../../marketing/screenshots/app-store/iphone-6.9/uk/01.png"
          ]
        }
      }
    }
  }
}
```

Paths resolve from **`apps/mobile/`**, not the config file's directory. Thus the English example resolves to `marketing/screenshots/app-store/iphone-6.9/en-US/01.png` at the repo root. EAS `metadata:pull` instead writes images under `apps/mobile/store/apple/screenshot/<locale>/<display-type>/`; that private export directory stays gitignored. Commit approved exports in the separate App Store directory so the release checkout contains them; never stage a whole pull export.

Use **`APP_IPHONE_67`** for the 1320×2868 iPhone screenshots. CLI 27.2.0 [pins `@expo/apple-utils` 2.2.1](https://github.com/expo/eas-cli/blob/v27.2.0/packages/eas-cli/package.json#L47), whose [display-type enum](https://unpkg.com/@expo/apple-utils@2.2.1/ts-declarations/expo__app-store/app-store.d.ts) includes `APP_IPHONE_67` and no `APP_IPHONE_69`. [Apple's specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/) accept 1320×2868 for this large iPhone display group and allow **1–10 images per device size and locale**, in PNG/JPG/JPEG format. The EAS schema accepts arbitrary display-type keys and string arrays: it does **not** validate the display type, count, file existence, dimensions or filename pattern. The screenshot task has no additional filename rule; it uses the basename, so keep basenames unique within each set and use numbered names to make the intended order clear.

The [27.2.0 screenshot task](https://github.com/expo/eas-cli/blob/v27.2.0/packages/eas-cli/src/metadata/apple/tasks/screenshots.ts) syncs each configured, nonempty locale/display-type set:

- Creates a set if missing. Keeps a **completed** remote screenshot when basename and byte size match; it does not compare image contents, so a same-size replacement needs a new filename.
- **Deletes existing screenshots in that set that it does not retain**, including same-name replacements with a different size or incomplete processing. Uploads new files, waits for processing, then reorders by the config array.
- A missing local file keeps an existing completed screenshot with that basename regardless of size. Otherwise it warns and skips the upload; deletions have already happened, so a successful push alone does not prove every image was uploaded.
- Unlisted locales/display types, absent screenshot fields, and empty objects/arrays are skipped. **An empty array does not clear a set.** Today's text-only config leaves screenshots untouched.

[`metadata:push`](https://github.com/expo/eas-cli/blob/v27.2.0/packages/eas-cli/src/commands/metadata/push.ts) passes `--non-interactive` through to [metadata authentication](https://github.com/expo/eas-cli/blob/v27.2.0/packages/eas-cli/src/metadata/auth.ts), which can retrieve the existing submission API key from EAS credentials. Screenshots use the same authenticated app context; no separate screenshot credential is required. Apple still requires metadata permissions: its [asset-management roles](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-your-app-store-assets) are Account Holder, Admin, App Manager or Marketing. A Developer key that can upload builds alone is not proof of screenshot permission. This investigation does not inspect the stored key's role or test screenshot uploads against ASC.

**Release tags:** [Release run 41300472511](https://github.com/kprovorov/fitme/actions/runs/41300472511/job/124830211269) checked out `v2.4.1` (`87d55cd28c9c16da2ca6d568e8558b858158087d`); its listing push succeeded at **2026-11-01 11:19:03 UTC / 12:19:03 Madrid**. [The workflow checks out the release tag](https://github.com/kprovorov/fitme/blob/v2.4.1/.github/workflows/build-mobile.yml#L42-L45), so later screenshot commits cannot reach that version through its release CI, including a rebuild of the same tag; the Update App Store Screenshots workflow pushes `main`'s sets to a still-editable draft instead (see [Updating a pending release](app-store/README.md#updating-a-pending-release)). The [App Store screenshots shipped from the repo](https://linear.app/provorov/project/app-store-screenshots-shipped-from-the-repo-b89e8a9bd811) project defines the reusable contract; the approved image set and its intended release are supplied separately.

Verification: a scratch copy of the current listing with both blocks above passed AJV against the pinned schema; a non-string path was rejected. This proves the config shape only. [`metadata:lint`](https://github.com/expo/eas-cli/blob/v27.2.0/packages/eas-cli/src/commands/metadata/lint.ts) has no login context and is designed to avoid service calls, but no metadata command was run, per FIT-500's scope. No credentials or App Store Connect calls were used.

## How to reproduce

Use a Release simulator build with the local API and Library, a dedicated Clerk development user, and a local database seeded with `seed/seed.sql`. Assign valid Library cover IDs to the seeded workouts, and translate the demo plan and workout text for the selected language. The Library needs a real exercise bundle and the public media origin; the fixture bundle contains test exercises. Capture with the device tooling at 3×, then run the framing command above. Never run the seed against production: it replaces the selected user's local workout, plan and profile data.
