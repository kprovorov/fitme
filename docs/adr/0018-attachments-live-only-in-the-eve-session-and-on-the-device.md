---
status: accepted
date: 2026-11-04
---

# Attachments live only in the eve session and on the device

A User can add images (Attachments) to a message to Arnold. The app re-encodes each image as a JPEG of at most about 1600 px on its longest side. That drops EXIF, GPS included, and turns HEIC, which eve can't show the model, into a format it can. The app then sends the JPEG inline, as a `data:` URL file part on eve's HTTP channel. We run no storage of our own for Attachments: eve keeps the bytes in the session, so an Attachment follows the Conversation's retention and the account-deletion reset with no new deletion path. eve keeps them in the session's sandbox, and reads them back from it before every model call, so the sandbox has to keep its files between workflow steps: on Vercel that is a persistent Vercel Sandbox (`agent/sandbox.ts`), which eve deletes with its snapshots when the session ends or is reset, with a 31-day snapshot expiry as the backstop. eve's stream never echoes the bytes back, so the app keeps its own copy on the device to show in the User's message. The copy is keyed per Clerk User and Conversation, and is deleted with the Conversation and on account deletion.

## Considered options

- **Inline, plus a device copy (chosen).** No bucket, no RLS or signed URLs, no retention job. The cost is the request body: Vercel's 4.5 MB limit leaves about 3.3 MB of base64, so the app allows at most 4 Attachments per message.
- **Upload to Supabase Storage or Vercel Blob, then send a URL** (with eve's `fetchFile`). This allows bigger files and shows images on every device. It needs a bucket with its own access rules, plus cleanup on Conversation expiry and on account deletion, all for files the model doesn't need beyond ~1600 px.

## Consequences

- Sent Attachments show only on the device that sent them. Elsewhere, or after a reinstall, a message shows a plain Photo tile instead.
- eve resends every earlier image on every model call, so Attachments add to the cost of each later step, and Arnold's turn budget is $1. To keep a turn from being cancelled for no visible reason, the app allows at most 10 Attachments per Conversation. The server doesn't enforce that cap; the turn budget is the backstop.
- Arnold's eve channel accepts only `image/jpeg`, `image/png` and `image/webp`, up to 3 MiB each (`uploadPolicy`).
- A model joins `arnoldModels` only if it takes images.
- A Conversation with Attachments wakes a Vercel Sandbox (1 vCPU, stopped 5 minutes after a turn, no network) and resumes it from its snapshot when it has stopped: about $0.0035 per wake, plus a little latency on the first model call after it. A text-only Conversation never opens one. Until eve 0.83 and this sandbox, Arnold ran on just-bash, which keeps nothing on Vercel, so no Attachment reached the model in production (`docs/research/arnold-attachment-storage.md`).
- Moving to our own storage later means Attachments already sent stay device-only.
