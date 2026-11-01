// The App Store screenshots: checks the Screenshot sets committed under
// marketing/screenshots/app-store/, laid out as <device>/<Listing locale>/NN.png
// (see that directory's README). No network, no secrets; nothing is ever
// resized or repaired.
//
// Usage: node scripts/app-store-screenshots.mjs check [dir]
//        (default marketing/screenshots/app-store)
import { constants as bufferConstants } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const DEFAULT_DIR = fileURLToPath(
  new URL("../marketing/screenshots/app-store", import.meta.url)
);

const USAGE = "Usage: node scripts/app-store-screenshots.mjs check [dir]";

// Device folder → Apple display type and the one size its images have, in
// portrait. A new device size is a new entry, once the pinned EAS CLI's Apple
// utilities know its display type.
const DEVICES = {
  "iphone-6.9": { displayType: "APP_IPHONE_67", height: 2868, width: 1320 },
};

const KNOWN_DEVICES = `known: ${Object.keys(DEVICES).join(", ")}`;

const MAX_IMAGES = 10;
const IMAGE_NAME = /^(\d{2})\.png$/;
// The README lives beside the device folders; Finder litters every folder it
// opens with .DS_Store (git-ignored, so never in a commit).
const ROOT_FILES = new Set(["README.md"]);
const IGNORED = new Set([".DS_Store"]);

const entries = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !IGNORED.has(entry.name))
    .sort((a, b) => (a.name < b.name ? -1 : Number(a.name > b.name)));

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

// Colour type → channels per pixel and the bit depths the PNG spec allows.
const COLOR_TYPES = {
  0: { bitDepths: [1, 2, 4, 8, 16], channels: 1 }, // greyscale
  2: { bitDepths: [8, 16], channels: 3 }, // RGB
  3: { bitDepths: [1, 2, 4, 8], channels: 1 }, // palette
  4: { bitDepths: [8, 16], channels: 2 }, // greyscale + alpha
  6: { bitDepths: [8, 16], channels: 4 }, // RGB + alpha
};
const ALPHA_COLOR_TYPES = new Set([4, 6]);
const MAX_FILTER_TYPE = 4;
// The PNG spec's limit on width and height.
const MAX_DIMENSION = 2 ** 31 - 1;
// The chunks a decoder must understand; any other critical one (its type
// starting with a capital) means the image can't be decoded.
const CRITICAL_CHUNKS = new Set(["IHDR", "PLTE", "IDAT", "IEND"]);
const isCritical = (type) => type[0] === type[0].toUpperCase();

// Adam7: each pass's first column and row, and its column and row step.
const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
];

class PngError extends Error {}
// Not even a PNG: the bytes under the .png name are something else.
class NotPngError extends PngError {}

// The sub-images the scanlines come in: the whole image, or Adam7's passes.
const passes = ({ height, interlace, width }) =>
  interlace === 0
    ? [{ height, width }]
    : ADAM7.map(([x0, y0, dx, dy]) => ({
        height: Math.max(0, Math.ceil((height - y0) / dy)),
        width: Math.max(0, Math.ceil((width - x0) / dx)),
      }));

const readChunks = (bytes) => {
  const chunks = [];
  let offset = PNG_SIGNATURE.length;
  while (chunks.at(-1)?.type !== "IEND") {
    if (offset + 12 > bytes.length) {
      throw new PngError("it ends before its IEND chunk");
    }
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) {
      throw new PngError("it ends inside a chunk");
    }
    const body = bytes.subarray(offset + 4, end - 4);
    if (zlib.crc32(body) !== bytes.readUInt32BE(end - 4)) {
      throw new PngError("a chunk's CRC doesn't match");
    }
    chunks.push({
      data: body.subarray(4),
      type: body.subarray(0, 4).toString("latin1"),
    });
    offset = end;
  }
  if (offset !== bytes.length) {
    throw new PngError("it has data after its IEND chunk");
  }
  const unknown = chunks.find(
    ({ type }) => isCritical(type) && !CRITICAL_CHUNKS.has(type)
  );
  if (unknown) {
    throw new PngError(`an unknown critical chunk (${unknown.type})`);
  }
  if (chunks.filter(({ type }) => type === "IHDR").length > 1) {
    throw new PngError("more than one IHDR chunk");
  }
  const idat = chunks.flatMap(({ type }, i) => (type === "IDAT" ? [i] : []));
  if (idat.some((index, i) => i > 0 && index !== idat[i - 1] + 1)) {
    throw new PngError("its IDAT chunks aren't consecutive");
  }
  return chunks;
};

const readHeader = (chunks) => {
  const [first] = chunks;
  if (first.type !== "IHDR" || first.data.length !== 13) {
    throw new PngError("it doesn't start with an IHDR chunk");
  }
  const { data } = first;
  const header = {
    bitDepth: data[8],
    colorType: data[9],
    height: data.readUInt32BE(4),
    interlace: data[12],
    width: data.readUInt32BE(0),
  };
  const format = COLOR_TYPES[header.colorType];
  if (
    !format?.bitDepths.includes(header.bitDepth) ||
    data[10] !== 0 ||
    data[11] !== 0 ||
    header.interlace > 1 ||
    header.width === 0 ||
    header.height === 0 ||
    header.width > MAX_DIMENSION ||
    header.height > MAX_DIMENSION
  ) {
    throw new PngError("its IHDR chunk is invalid");
  }
  return { ...header, channels: format.channels };
};

// Inflates the image data and walks every scanline, so a PNG whose pixels are
// cut short, run long or carry an unknown filter type fails, not just one
// whose chunks are broken.
const decodeImageData = (chunks, header) => {
  // Each sub-image's scanlines: a filter-type byte, then the packed pixels.
  const scanlines = passes(header)
    .filter(({ width }) => width > 0)
    .map(({ height, width }) => ({
      count: height,
      length: 1 + Math.ceil((width * header.channels * header.bitDepth) / 8),
    }));
  const expected = scanlines.reduce(
    (sum, { count, length }) => sum + count * length,
    0
  );
  const data = Buffer.concat(
    chunks.filter((c) => c.type === "IDAT").map((c) => c.data)
  );
  if (data.length === 0) {
    throw new PngError("it has no image data");
  }
  let raw;
  try {
    raw = zlib.inflateSync(data, {
      maxOutputLength: Math.min(expected + 1, bufferConstants.MAX_LENGTH),
    });
  } catch (error) {
    if (error.code === "ERR_BUFFER_TOO_LARGE") {
      throw new PngError("its image data is too long", { cause: error });
    }
    throw new PngError("its image data doesn't inflate", { cause: error });
  }
  if (raw.length !== expected) {
    throw new PngError(
      `its image data is ${raw.length < expected ? "short" : "too long"}`
    );
  }
  let offset = 0;
  for (const { count, length } of scanlines) {
    for (let row = 0; row < count; row += 1) {
      if (raw[offset] > MAX_FILTER_TYPE) {
        throw new PngError("a scanline has an unknown filter type");
      }
      offset += length;
    }
  }
};

// Decodes a PNG fully; answers its size and whether it has an alpha channel
// or a transparency chunk, or throws a PngError saying why it doesn't decode.
const readPng = (bytes) => {
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new NotPngError("no PNG signature");
  }
  const chunks = readChunks(bytes);
  const header = readHeader(chunks);
  if (header.colorType === 3 && !chunks.some((c) => c.type === "PLTE")) {
    throw new PngError("a palette image without a PLTE chunk");
  }
  decodeImageData(chunks, header);
  return {
    alpha: ALPHA_COLOR_TYPES.has(header.colorType),
    height: header.height,
    transparency: chunks.some((c) => c.type === "tRNS"),
    width: header.width,
  };
};

const checkImage = ({ device, file, label, problems }) => {
  let image;
  try {
    image = readPng(fs.readFileSync(file));
  } catch (error) {
    if (!(error instanceof PngError)) {
      throw error;
    }
    problems.push(
      error instanceof NotPngError
        ? `${label}: not a PNG (${error.message})`
        : `${label}: doesn't decode as a PNG (${error.message})`
    );
    return;
  }
  const { height, width } = device;
  if (image.width !== width || image.height !== height) {
    problems.push(
      image.width === height && image.height === width
        ? `${label}: landscape (${image.width}×${image.height}), needs portrait ${width}×${height}`
        : `${label}: ${image.width}×${image.height}, needs exactly ${width}×${height} (portrait)`
    );
  }
  if (image.alpha) {
    problems.push(
      `${label}: has an alpha channel (even fully opaque, export without one)`
    );
  }
  if (image.transparency) {
    problems.push(
      `${label}: has transparency (a tRNS chunk), export fully opaque`
    );
  }
};

const imageName = (number) => `${String(number).padStart(2, "0")}.png`;

// One Screenshot set: its names and numbering, then each image against its
// device's size (a DEVICES entry).
const checkSet = ({ device, dir, label, problems }) => {
  const numbers = [];
  for (const entry of entries(dir)) {
    const match = IMAGE_NAME.exec(entry.name);
    const number = match ? Number(match[1]) : 0;
    if (!entry.isFile() || number < 1) {
      problems.push(
        `${label} / ${entry.name}: not an image name (a Screenshot set holds only 01.png, 02.png, … in display order)`
      );
      continue;
    }
    numbers.push(number);
    checkImage({
      device,
      file: path.join(dir, entry.name),
      label: `${label} / ${entry.name}`,
      problems,
    });
  }
  if (numbers.length === 0) {
    problems.push(
      `${label}: empty Screenshot set (it needs 1 to ${MAX_IMAGES} images)`
    );
    return 0;
  }
  if (numbers.length > MAX_IMAGES) {
    problems.push(`${label}: ${numbers.length} images, at most ${MAX_IMAGES}`);
  }
  const present = new Set(numbers);
  const last = Math.max(...numbers);
  for (let number = 1; number < last; number += 1) {
    if (!present.has(number)) {
      problems.push(
        `${label} / ${imageName(number)}: missing (images are numbered from 01.png with no gaps, up to ${imageName(last)} here)`
      );
    }
  }
  return numbers.length;
};

const checkScreenshots = (dir) => {
  const problems = [];
  let sets = 0;
  let imageCount = 0;
  if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
    problems.push(`${dir}: no such directory`);
    return { imageCount, problems, sets };
  }
  for (const device of entries(dir)) {
    if (!device.isDirectory()) {
      if (!ROOT_FILES.has(device.name)) {
        problems.push(`${device.name}: not a device folder (${KNOWN_DEVICES})`);
      }
      continue;
    }
    if (!Object.hasOwn(DEVICES, device.name)) {
      problems.push(`${device.name}: unknown device folder (${KNOWN_DEVICES})`);
      continue;
    }
    const deviceDir = path.join(dir, device.name);
    for (const locale of entries(deviceDir)) {
      if (!locale.isDirectory()) {
        problems.push(
          `${device.name} / ${locale.name}: not a Listing locale folder (a device folder holds one folder per Listing locale)`
        );
        continue;
      }
      sets += 1;
      imageCount += checkSet({
        device: DEVICES[device.name],
        dir: path.join(deviceDir, locale.name),
        label: `${device.name} / ${locale.name}`,
        problems,
      });
    }
  }
  return { imageCount, problems, sets };
};

const main = (args) => {
  const [command, dir = DEFAULT_DIR, ...rest] = args;
  if (command !== "check" || rest.length > 0) {
    console.error(USAGE);
    return 2;
  }
  const { imageCount, problems, sets } = checkScreenshots(dir);
  for (const problem of problems) {
    console.error(problem);
  }
  if (problems.length > 0) {
    return 1;
  }
  console.log(
    `${sets} Screenshot ${sets === 1 ? "set" : "sets"}, ${imageCount} ${imageCount === 1 ? "image" : "images"}: all pass.`
  );
  return 0;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
