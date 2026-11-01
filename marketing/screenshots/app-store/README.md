# App Store screenshots

Design agreed during the screenshot release discussion. The image set, validation
command and release integration have not been implemented yet.

The [App Store screenshots as code project](https://linear.app/provorov/project/app-store-screenshots-as-code-a432c611ca4b)
holds the full spec, approved testing approach and implementation tickets.

## Scope

The agreed implementation covers the App Store directory and naming contract,
asset validation on pull requests and before release builds, and screenshot
upload and verification through the existing EAS Metadata release pipeline.
Capture, localization, framing, design approval and reorganizing other marketing
screenshots belong to a separate agent task. The broader marketing directory
should use the [same locale grouping](../README.md#locale-grouping) when that
work happens.

## Files

Approved App Store images belong in `marketing/screenshots/app-store/`, alongside
the bare captures in `../iphone/` and framed images in `../framed/`:

```text
app-store/
  en-US/
    01_20261101T143000Z.png
    02_20261101T143000Z.png
    ...
  uk-UA/
    01_20261101T143000Z.png
    02_20261101T143000Z.png
    ...
```

Use `NN_YYYYMMDDTHHMMSSZ.png`: a two-digit position (`01` through `10`) and the
image revision's UTC timestamp, including seconds. The example timestamps above
are illustrative. Both languages use the same positions, with 1–10 images per
language; their revision timestamps can differ.

Folder names use full locale tags (`en-US`, `uk-UA`). In `store.config.json`,
Apple's locale keys remain `en-US` and `uk`: the `uk` entry lists paths into
`marketing/screenshots/app-store/uk-UA/`. Validate that mapping explicitly.

Commit the approved PNGs directly to Git so a release tag contains its complete
screenshot set. Capture and design happen before release; release CI uploads
those approved files.

The repository defines the images and their order for each managed App Store
set, including removal of images no longer listed. Release CI targets the tagged
version's draft and does not submit it for App Review.

## Validation

The planned check runs on pull requests and before a release build or any
screenshot upload. It must reject:

- Missing or unreadable files, including PNGs that cannot be fully decoded.
- Files that are not portrait **1320×2868 PNGs**, or include an alpha channel
  or transparency. This is the chosen iPhone export size, within
  [Apple's accepted dimensions](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).
- Filenames outside `NN_YYYYMMDDTHHMMSSZ.png`, invalid UTC timestamps, positions
  outside `01`–`10`, gaps, duplicate positions or extra images. Positions start
  at `01` and stay consecutive; only one revision per position is present.
- Different positions between the `en-US` and `uk-UA` folders, missing languages,
  incorrect metadata locale mapping (`en-US` → `en-US/`, `uk` → `uk-UA/`), or
  unsupported display types (only `APP_IPHONE_67` is planned).
- Empty sets or more than 10 images per language.
- Config paths or order that disagree with the approved files. Order by the
  numeric position prefix, independent of timestamps.
- In pull requests, changed image bytes at an existing filename relative to the
  PR base. Replacing an image requires a new revision timestamp and filename.

Invalid assets, upload failures or failed upload verification must fail the
workflow. A successful CLI exit alone is insufficient evidence of a complete,
correctly ordered upload.

## Replacing an image

When an image changes, keep its position prefix, use a fresh UTC timestamp,
remove the old revision and update its config path. Unchanged images retain
their names across releases; the timestamp belongs to the image revision, not
the release or upload run.

EAS CLI 27.2.0 retains completed remote images by basename and byte size, without
comparing their contents. A new revision filename ensures that a replacement is
uploaded even when its byte size happens to match the old image. The repository
filenames are also the upload filenames.

See the [EAS investigation](../README.md#app-store-upload)
for the pinned CLI behavior and authentication details.
