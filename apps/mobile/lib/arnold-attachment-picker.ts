/**
 * Where an Arnold Attachment comes from: the system photo picker, and the
 * re-encoding every picked image goes through (ADR 0018). It is the only
 * module importing `expo-image-picker` and `expo-image-manipulator`, so a
 * screen test stands this one module in and never touches a native module.
 */
import { captureException } from "@sentry/react-native";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

/** The longest side of a re-encoded Attachment, in pixels (ADR 0018). */
export const MAX_ATTACHMENT_EDGE = 1600;

/**
 * The JPEG quality every Attachment is saved at: measured on the simulator,
 * a detailed photo lands at about 400 KB at `MAX_ATTACHMENT_EDGE` (the
 * 300–500 KB ADR 0018 asks for), so four of them are about 2 MB of base64,
 * well under both eve's 3 MiB per image and Vercel's 4.5 MB request body.
 * 0.8 put that same photo at 879 KB, which four of would overrun the body.
 */
const JPEG_QUALITY = 0.7;

/** An image on this device, ready to show and (later) to send. */
export interface PickedImage {
  height: number;
  uri: string;
  width: number;
}

/**
 * Re-encodes the image at `uri` as a JPEG of at most `MAX_ATTACHMENT_EDGE`
 * on its longest side, in the cache directory. Decoding from the pixels
 * drops every EXIF tag, GPS included, and turns a HEIC photo — the iPhone's
 * own format, which eve can't show the model — into one it can.
 */
export async function shrinkToJpeg(uri: string): Promise<PickedImage> {
  // The load bounds downsample while decoding, so a 12 MP photo never
  // reaches memory in full.
  const context = ImageManipulator.manipulate(uri, {
    maxHeight: MAX_ATTACHMENT_EDGE,
    maxWidth: MAX_ATTACHMENT_EDGE,
  });
  const decoded = await context.renderAsync();
  const resized =
    Math.max(decoded.width, decoded.height) > MAX_ATTACHMENT_EDGE
      ? // Only when the decode bounds left it larger than asked: resizing an
        // image already under them would blow it up again.
        await context
          .resize(
            decoded.width >= decoded.height
              ? { height: null, width: MAX_ATTACHMENT_EDGE }
              : { height: MAX_ATTACHMENT_EDGE, width: null }
          )
          .renderAsync()
      : decoded;
  const saved = await resized.saveAsync({
    compress: JPEG_QUALITY,
    format: SaveFormat.JPEG,
  });
  return { height: saved.height, uri: saved.uri, width: saved.width };
}

/** What the picker came back with. */
export interface PickedPhotos {
  /** How many the picker gave that couldn't be re-encoded. */
  failed: number;
  /** The re-encoded JPEGs, in the order the User picked them. */
  images: readonly PickedImage[];
}

/**
 * The system photo picker, for at most `limit` images, each answered as a
 * re-encoded JPEG in the order the User picked it; `null` when they
 * cancelled, so nothing changes.
 *
 * Images only, so iOS opens its own picker (`PHPickerViewController`) and
 * needs no photo library permission: Fitme sees what the User picked and
 * nothing else. `limit` must be at least 1 — the picker reads 0 as "no
 * limit" — so the caller checks the per-message cap first.
 */
export async function pickLibraryPhotos(
  limit: number
): Promise<PickedPhotos | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    allowsMultipleSelection: true,
    // Never the EXIF: re-encoding drops it, and nothing here reads it.
    exif: false,
    mediaTypes: ["images"],
    orderedSelection: true,
    selectionLimit: limit,
  });
  if (result.canceled) {
    return null;
  }
  const images: PickedImage[] = [];
  let failed = 0;
  // One at a time, never `Promise.all`: four full-resolution photos decoded
  // at once can run a phone out of memory.
  for (const asset of result.assets) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one photo at a time, on purpose
      images.push(await shrinkToJpeg(asset.uri));
    } catch (error) {
      // One photo the decoder can't read (a RAW, a broken file) never costs
      // the User the others they picked; it is reported and left out.
      failed += 1;
      captureException(error);
    }
  }
  return { failed, images };
}
