/**
 * The device copy of the Attachments a User sent Arnold (ADR 0018).
 *
 * eve keeps an Attachment's bytes in its session and never echoes them back:
 * the stream's `message.received` carries a file part's metadata only. So the
 * app keeps the re-encoded JPEG it sent on the phone, and the User's bubble is
 * drawn from that copy rather than from anything Arnold sends.
 *
 * A copy is **named** by the `filename` its send carried, which eve echoes
 * back with the message, so the copies of one message are found again from the
 * saved Conversation after a reopen or a restart, with no index of ours to
 * keep in step with the thread.
 *
 * A copy lives under the Clerk User and the Conversation (the eve session):
 *
 * ```
 * <documents>/arnold-attachments/<user>/<session or "pending">/<name>.jpg
 * ```
 *
 * The first message of a Conversation is sent before eve has named its
 * session, so it goes to `pending`, which `followSentAttachments` moves under
 * the session id as soon as eve reports one. That same call sweeps every other
 * Conversation of the User, so a session replacing the saved one takes the
 * copies of the Conversation it replaced with it.
 *
 * In the documents directory, not the cache, so iOS doesn't purge a photo the
 * Conversation still shows. Nothing here is kept for a signed-out User's sake
 * beyond what their Conversation is: a sign-out keeps both, and only the "+"
 * reset, a replaced session or an account deletion take them away.
 */
import { captureException } from "@sentry/react-native";
import { Directory, File, Paths } from "expo-file-system";

/** The directory every User's Conversations keep their copies under. */
const ROOT = "arnold-attachments";

/** Where a Conversation's copies go until eve has named its session. */
const PENDING = "pending";

/**
 * The name of one copy: a base36 timestamp, its place in its message and a
 * random tail, so two messages of one Conversation never collide, across app
 * launches included (nothing in memory numbers them).
 *
 * It goes on the wire as the file part's `filename`, so it carries no part of
 * the photo and nothing of the User's: eve stages it under this name and the
 * echo brings it back. It holds no `]`, so eve's own `[file: <name>]`
 * placeholder still reads as one (`shownUserMessage`).
 */
const copyName = (index: number): string =>
  `${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 10)}.jpg`;

/** Only a name this module made resolves, so an echoed one can't walk out. */
const COPY_NAME = /^[0-9a-z]+-\d+-[0-9a-z]+\.jpg$/u;

/** The User's own directory; their Clerk id encoded, so any id is a name. */
const userDirectory = (userId: string): Directory =>
  new Directory(Paths.document, ROOT, encodeURIComponent(userId));

/**
 * The Conversation's own directory: the eve session's, or `pending` until eve
 * has named it (the first message of a Conversation is sent before that).
 */
const conversationDirectory = (
  userId: string,
  sessionId: string | undefined
): Directory =>
  new Directory(
    userDirectory(userId),
    sessionId ? encodeURIComponent(sessionId) : PENDING
  );

/**
 * Copies each re-encoded JPEG into its Conversation's directory and answers
 * the name it was saved under, one per `uris` entry and in the same order.
 *
 * Every Attachment gets its name whether or not its copy could be written:
 * the name goes on the wire either way, so a disk that refuses the copy costs
 * the User the thumbnail (a Photo tile stands in, FIT-588) and never the
 * message. It is why this never rejects; a failure is reported instead.
 */
export const keepSentAttachments = async (
  userId: string,
  sessionId: string | undefined,
  uris: readonly string[]
): Promise<readonly string[]> => {
  // A text-only send, which is most of them, touches no file at all: no
  // directory of a Conversation that has sent no Attachment is ever made.
  if (uris.length === 0) {
    return [];
  }

  const names = uris.map((_uri, index) => copyName(index));
  const directory = conversationDirectory(userId, sessionId);

  try {
    directory.create({ idempotent: true, intermediates: true });
  } catch (error) {
    captureException(error);

    return names;
  }

  // Settled, not all: a copy the device refuses must not take the others
  // down with it, and nothing here decodes, so the copies run together.
  const copied = await Promise.allSettled(
    uris.map((uri, index) =>
      new File(uri).copy(new File(directory, names[index] ?? ""))
    )
  );

  for (const result of copied) {
    if (result.status === "rejected") {
      captureException(result.reason);
    }
  }

  return names;
};

/**
 * Where the copy named `filename` is, or `undefined` when this device hasn't
 * got it: a Conversation sent from another device, a reinstall, a purge, or a
 * message sent before the copies existed. The caller shows a Photo tile then.
 */
export const sentAttachmentUri = (
  userId: string,
  sessionId: string | undefined,
  filename: string
): string | undefined => {
  if (!COPY_NAME.test(filename)) {
    return;
  }

  const file = new File(conversationDirectory(userId, sessionId), filename);

  return file.exists ? file.uri : undefined;
};

/**
 * Takes the copies of a send that went nowhere back off the device: Arnold
 * refused it or it failed, so its Attachments are in the composer again and
 * a retry writes its own copies. The caller must have checked that no message
 * names them (`echoedAttachmentNames`), since a turn can fail after eve has
 * echoed its message; leaving them otherwise would pile up a photo per try.
 *
 * By name alone, in whichever of the User's Conversation directories holds
 * it: a name is this module's own and unique, and the copies of a first
 * message move from `pending` to the session's directory as soon as eve names
 * it, so the Conversation a send read before it went is no longer where its
 * copies are.
 */
export const dropSentAttachments = (
  userId: string,
  filenames: readonly string[]
): void => {
  const named = new Set(filenames.filter((name) => COPY_NAME.test(name)));

  if (named.size === 0) {
    return;
  }

  const user = userDirectory(userId);

  if (!user.exists) {
    return;
  }

  try {
    for (const conversation of user.list()) {
      for (const name of named) {
        const file = new File(conversation, name);

        if (file.exists) {
          file.delete();
        }
      }
    }
  } catch (error) {
    captureException(error);
  }
};

/** Deletes a directory that is there, and reports a deletion that fails. */
const removeDirectory = (directory: Directory): void => {
  try {
    if (directory.exists) {
      directory.delete();
    }
  } catch (error) {
    captureException(error);
  }
};

/**
 * Binds the User's copies to the session eve has just reported: the
 * Conversation's `pending` copies move under it, and every other
 * Conversation's copies go, since a session replacing the saved one replaces
 * the Conversation. Called when the saved session id changes, so a Conversation
 * being resumed does no work at all.
 */
export const followSentAttachments = (
  userId: string,
  sessionId: string
): void => {
  const user = userDirectory(userId);

  if (!user.exists) {
    return;
  }

  const current = conversationDirectory(userId, sessionId);
  const pending = conversationDirectory(userId, undefined);

  try {
    for (const child of user.list()) {
      if (child.uri !== current.uri && child.uri !== pending.uri) {
        removeDirectory(new Directory(child.uri));
      }
    }

    if (pending.exists) {
      pending.moveSync(current);
    }
  } catch (error) {
    captureException(error);
  }
};

/**
 * Forgets every copy of the User's: the "+" reset, a Conversation whose
 * session is gone, and an account deletion. A User with none is a no-op.
 */
export const forgetSentAttachments = (userId: string): void => {
  removeDirectory(userDirectory(userId));
};
