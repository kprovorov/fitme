# Eval fixture images

The images an eval sends Arnold as an Attachment (ADR 0018), through
`session.sendFile(text, path)`, which inlines the file as a `data:` URL.

Every image here is **generated**, never a photo of a real person or a
screenshot of someone's app: this repository is going public, and an eval
fixture is committed for good. Each is a JPEG at the size the app sends
(longest side about 1600 px, roughly 300–500 KB), so an eval exercises what a
User's phone actually puts in front of the model.

| File             | What it is                                                                 |
| ---------------- | -------------------------------------------------------------------------- |
| `body-photo.jpg` | A progress photo: a full-body mirror selfie of a person who doesn't exist, generated with `gpt-image-2.5-sunburst` (1024 × 1536). Sent by `body-photo.eval.ts`. |
