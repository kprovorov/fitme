/**
 * The photo picker and the re-encoder behind Arnold's Attachments, over
 * stood-in native modules: what the system picker is asked for, and that
 * every picked image comes back as a JPEG of at most 1600 px on its longest
 * side (ADR 0018), whatever size and format it had.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import {
  MAX_ATTACHMENT_EDGE,
  pickLibraryPhotos,
  readAttachmentDataUrl,
  shrinkToJpeg,
} from "~/lib/arnold-attachment-picker";

interface SaveOptions {
  compress?: number;
  format?: string;
}

interface Size {
  height: number | null;
  width: number | null;
}

/**
 * What the stood-in manipulator decoded each source to, the calls it took
 * and what it was asked to save. Named `mock…`, which is what Jest allows a
 * module factory to reach.
 */
const mockDecoded = new Map<string, { height: number; width: number }>();

/** The sources the stood-in decoder refuses, as a RAW or a broken file. */
const mockFailFor = new Set<string>();
const mockManipulated: { options: unknown; uri: string }[] = [];
const mockResizes: Size[] = [];
const mockSaves: SaveOptions[] = [];

const mockRender = (uri: string, size: { height: number; width: number }) => ({
  height: size.height,
  saveAsync: (options: SaveOptions = {}) => {
    mockSaves.push(options);

    return Promise.resolve({
      height: size.height,
      uri: `${uri}.jpg`,
      width: size.width,
    });
  },
  width: size.width,
});

jest.mock("expo-image-manipulator", () => ({
  ImageManipulator: {
    manipulate: (uri: string, options: unknown) => {
      mockManipulated.push({ options, uri });

      if (mockFailFor.has(uri)) {
        throw new Error("Could not decode the image");
      }

      const size = mockDecoded.get(uri) ?? { height: 1200, width: 1600 };

      return {
        renderAsync: () => Promise.resolve(mockRender(uri, size)),
        resize: (next: Size) => {
          mockResizes.push(next);

          // As the native one does: the side left null follows the ratio.
          const scale =
            next.width === null
              ? (next.height ?? 0) / size.height
              : next.width / size.width;

          return {
            renderAsync: () =>
              Promise.resolve(
                mockRender(uri, {
                  height: Math.round(size.height * scale),
                  width: Math.round(size.width * scale),
                })
              ),
          };
        },
      };
    },
  },
  SaveFormat: { JPEG: "jpeg", PNG: "png", WEBP: "webp" },
}));

const mockLaunchImageLibrary =
  jest.fn<(options: unknown) => Promise<unknown>>();

const mockCaptureException = jest.fn();

jest.mock("@sentry/react-native", () => ({
  captureException: (error: unknown) => mockCaptureException(error),
}));

jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: (options: unknown) =>
    mockLaunchImageLibrary(options),
}));

/** The base64 the stood-in file system answers per path. */
const mockFileBase64 = new Map<string, string>();

jest.mock("expo-file-system", () => ({
  File: class {
    readonly #uri: string;
    constructor(uri: string) {
      this.#uri = uri;
    }
    base64() {
      const base64 = mockFileBase64.get(this.#uri);

      return base64 === undefined
        ? Promise.reject(new Error(`No such file: ${this.#uri}`))
        : Promise.resolve(base64);
    }
  },
}));

/** What the picker answers for images the User picked. */
const picks = (...uris: string[]) => ({
  assets: uris.map((uri) => ({ uri })),
  canceled: false,
});

/** The decode bounds every image is loaded within. */
const DECODE_BOUNDS = {
  maxHeight: MAX_ATTACHMENT_EDGE,
  maxWidth: MAX_ATTACHMENT_EDGE,
};

beforeEach(() => {
  mockFileBase64.clear();
  mockDecoded.clear();
  mockFailFor.clear();
  mockCaptureException.mockClear();
  mockManipulated.length = 0;
  mockResizes.length = 0;
  mockSaves.length = 0;
  mockLaunchImageLibrary.mockReset();
});

describe("pickLibraryPhotos", () => {
  it("asks the system picker for images only, up to the slots left", async () => {
    mockLaunchImageLibrary.mockResolvedValue(picks("file:///a.heic"));

    await pickLibraryPhotos(3);

    expect(mockLaunchImageLibrary).toHaveBeenCalledWith({
      allowsMultipleSelection: true,
      exif: false,
      mediaTypes: ["images"],
      orderedSelection: true,
      selectionLimit: 3,
    });
  });

  it("answers each picked image as a JPEG, in the order it was picked", async () => {
    mockLaunchImageLibrary.mockResolvedValue(
      picks("file:///first.heic", "file:///second.png")
    );

    const picked = await pickLibraryPhotos(4);

    expect(picked?.failed).toBe(0);
    expect(picked?.images.map((image) => image.uri)).toEqual([
      "file:///first.heic.jpg",
      "file:///second.png.jpg",
    ]);
    expect(mockSaves).toEqual([
      { compress: 0.7, format: "jpeg" },
      { compress: 0.7, format: "jpeg" },
    ]);
    // Each decoded within the bounds, so no full-resolution photo is ever
    // held in memory.
    expect(mockManipulated).toEqual([
      { options: DECODE_BOUNDS, uri: "file:///first.heic" },
      { options: DECODE_BOUNDS, uri: "file:///second.png" },
    ]);
  });

  it("answers nothing, and re-encodes nothing, when the User cancels", async () => {
    mockLaunchImageLibrary.mockResolvedValue({ assets: null, canceled: true });

    await expect(pickLibraryPhotos(4)).resolves.toBeNull();
    expect(mockManipulated).toEqual([]);
  });

  it("keeps the photos it could read when one of them fails", async () => {
    mockLaunchImageLibrary.mockResolvedValue(
      picks("file:///good.jpg", "file:///raw.dng", "file:///other.jpg")
    );
    mockFailFor.add("file:///raw.dng");

    const picked = await pickLibraryPhotos(4);

    expect(picked?.images.map((image) => image.uri)).toEqual([
      "file:///good.jpg.jpg",
      "file:///other.jpg.jpg",
    ]);
    expect(picked?.failed).toBe(1);
    // Reported, so a format that always fails shows up rather than being
    // silently dropped.
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});

describe("shrinkToJpeg", () => {
  it("leaves an image the decode bounds already fit at its size", async () => {
    mockDecoded.set("file:///small.jpg", { height: 900, width: 1200 });

    const image = await shrinkToJpeg("file:///small.jpg");

    expect(mockResizes).toEqual([]);
    expect(image).toEqual({
      height: 900,
      uri: "file:///small.jpg.jpg",
      width: 1200,
    });
  });

  it("brings a wide image's longest side down to 1600 px", async () => {
    mockDecoded.set("file:///wide.heic", { height: 3000, width: 4000 });

    const image = await shrinkToJpeg("file:///wide.heic");

    expect(mockResizes).toEqual([{ height: null, width: MAX_ATTACHMENT_EDGE }]);
    expect(image.width).toBe(MAX_ATTACHMENT_EDGE);
    expect(image.height).toBe(1200);
  });

  it("brings a tall screenshot's longest side down to 1600 px", async () => {
    mockDecoded.set("file:///tall.png", { height: 2796, width: 1290 });

    const image = await shrinkToJpeg("file:///tall.png");

    expect(mockResizes).toEqual([{ height: MAX_ATTACHMENT_EDGE, width: null }]);
    expect(image.height).toBe(MAX_ATTACHMENT_EDGE);
    expect(image.width).toBe(738);
  });
});

describe("readAttachmentDataUrl", () => {
  it("reads the JPEG as the data URL a send carries inline", async () => {
    mockFileBase64.set("file:///cache/gym.jpg", "Z3ltLWJ5dGVz");

    await expect(readAttachmentDataUrl("file:///cache/gym.jpg")).resolves.toBe(
      "data:image/jpeg;base64,Z3ltLWJ5dGVz"
    );
  });

  it("fails when the file is gone, rather than sending nothing", async () => {
    await expect(
      readAttachmentDataUrl("file:///cache/purged.jpg")
    ).rejects.toThrow("No such file");
  });
});
