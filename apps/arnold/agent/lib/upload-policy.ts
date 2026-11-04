import type { EveChannelInput } from "eve/channels/eve";

// eve's own ceiling for showing the model a file's bytes (eve's docs, Inbound
// attachments): a PNG, JPEG, GIF or WebP up to 3 MiB and 8000 px a side. A
// bigger image would reach the model as its label alone, so nothing larger is
// worth taking.
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

/**
 * What the eve channel takes as an Attachment (ADR 0018): the images the app
 * sends, and nothing else. The app re-encodes every picked image to a JPEG of
 * about 1600 px, so these three types and this cap are well above what it
 * sends; a hand-made request can't push a PDF, another file or a huge image at
 * the model. eve reads the declared `mediaType` and the decoded length of an
 * inline file part, and answers 415 for a type outside the list or 413 for one
 * over the cap, before the turn starts.
 */
export const attachmentUploadPolicy = {
  allowedMediaTypes: ["image/jpeg", "image/png", "image/webp"],
  maxBytes: MAX_ATTACHMENT_BYTES,
} as const satisfies NonNullable<EveChannelInput["uploadPolicy"]>;
