# Eval fixture images

The images an eval sends Arnold as an Attachment (ADR 0018), through
`session.sendFile(text, path)`, which inlines the file as a `data:` URL.

Every image here is **generated**, never a photo of a real person or a
screenshot of someone's app: this repository is going public, and an eval
fixture is committed for good. Each is a JPEG at the size the app sends
(longest side about 1600 px), so an eval exercises what a User's phone actually
puts in front of the model. A photo lands at roughly 300–500 KB there; a flat
UI screenshot compresses to a fraction of that at the same pixel size.

| File             | What it is                                                                 |
| ---------------- | -------------------------------------------------------------------------- |
| `body-photo.jpg` | A progress photo: a full-body mirror selfie of a person who doesn't exist, generated with `gpt-image-2.5-sunburst` (1024 × 1536). Sent by `body-photo.eval.ts`. |
| `plan-screenshot.jpg` | A training plan as some other app would show it ("Starter Strength", 2 days a week): a made-up screen with no real brand, app or person, rendered from `plan-screenshot.html` beside it, which carries the command to regenerate it (800 × 1600). Sent by `plan-screenshot.eval.ts`. |
