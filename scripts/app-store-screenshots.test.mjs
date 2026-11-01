import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const SCRIPT = fileURLToPath(
  new URL("./app-store-screenshots.mjs", import.meta.url)
);

const WIDTH = 1320;
const HEIGHT = 2868;

const tempDirs = [];
after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

// A PNG written by hand, so the fixtures don't depend on the decoder under
// test: signature, IHDR, optional tRNS, one IDAT of all-black rows, IEND.
const chunk = (type, data = Buffer.alloc(0)) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([length, body, crc]);
};

const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };
const pngCache = new Map();

const png = ({
  width = WIDTH,
  height = HEIGHT,
  colorType = 2,
  transparency = false,
} = {}) => {
  const key = JSON.stringify({ colorType, height, transparency, width });
  const cached = pngCache.get(key);
  if (cached) {
    return cached;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colorType;
  // compression, filter and interlace methods stay 0
  const rowBytes = 1 + width * CHANNELS[colorType];
  // Every byte 0: filter type None, black pixels. With an alpha channel the
  // alpha would be 0, so set it to 255: fully opaque, still an alpha channel.
  const raw = Buffer.alloc(rowBytes * height);
  if (colorType === 4 || colorType === 6) {
    const channels = CHANNELS[colorType];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        raw[y * rowBytes + 1 + x * channels + channels - 1] = 255;
      }
    }
  }
  const parts = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
  ];
  if (transparency) {
    // RGB colour key: black is transparent.
    parts.push(chunk("tRNS", Buffer.alloc(6)));
  }
  parts.push(chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND"));
  const bytes = Buffer.concat(parts);
  pngCache.set(key, bytes);
  return bytes;
};

// tree: { "iphone-6.9/en-US/01.png": Buffer | string, "some/dir/": null }
const makeTree = (tree) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "app-store-shots-"));
  tempDirs.push(dir);
  for (const [name, content] of Object.entries(tree)) {
    const file = path.join(dir, name);
    if (name.endsWith("/")) {
      fs.mkdirSync(file, { recursive: true });
      continue;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return dir;
};

const images = (set, count, bytes = png()) =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      `${set}/${String(i + 1).padStart(2, "0")}.png`,
      bytes,
    ])
  );

const run = (...args) => {
  const child = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
  });
  return {
    lines: child.stderr ? child.stderr.trimEnd().split("\n") : [],
    status: child.status,
    stdout: child.stdout,
  };
};

const check = (dir) => run("check", dir);

// The expected texts that start no line of stderr: [] when each is reported.
const unreported = ({ lines }, expected) =>
  expected.filter((start) => !lines.some((line) => line.startsWith(start)));

const EN = "iphone-6.9/en-US";
const UK = "iphone-6.9/uk";

describe("check accepts", () => {
  test("a Screenshot set of one image", () => {
    const result = check(makeTree(images(EN, 1)));
    assert.equal(result.status, 0, result.lines.join("\n"));
    assert.deepEqual(result.lines, []);
  });
});

describe("check accepts (numbering)", () => {
  test("a Screenshot set of ten images, ordered through 10", () => {
    const result = check(makeTree(images(EN, 10)));
    assert.equal(result.status, 0, result.lines.join("\n"));
    assert.ok(result.stdout.startsWith("1 Screenshot set, 10 images"));
  });

  test("Listing locales with different counts", () => {
    const result = check(makeTree({ ...images(EN, 4), ...images(UK, 2) }));
    assert.equal(result.status, 0, result.lines.join("\n"));
    assert.deepEqual(result.lines, []);
  });
});

describe("check rejects (numbering)", () => {
  test("an empty Screenshot set", () => {
    const result = check(makeTree({ [`${EN}/`]: null }));
    assert.equal(result.status, 1, result.stdout);
    assert.deepEqual(
      unreported(result, ["iphone-6.9 / en-US: empty Screenshot set"]),
      [],
      result.lines.join("\n")
    );
  });

  test("eleven images", () => {
    const result = check(makeTree(images(EN, 11)));
    assert.equal(result.status, 1, result.stdout);
    assert.deepEqual(
      unreported(result, ["iphone-6.9 / en-US: 11 images, at most 10"]),
      [],
      result.lines.join("\n")
    );
  });

  test("a gap in the numbering", () => {
    const tree = images(EN, 4);
    delete tree[`${EN}/02.png`];
    const result = check(makeTree(tree));
    assert.equal(result.status, 1, result.stdout);
    assert.deepEqual(
      unreported(result, ["iphone-6.9 / en-US / 02.png: missing"]),
      []
    );
  });

  test("stray names, every one of them", () => {
    const result = check(
      makeTree({
        ...images(EN, 2),
        [`${EN}/1.png`]: png(),
        [`${EN}/03a.png`]: png(),
        [`${EN}/03.PNG`]: png(),
        [`${EN}/notes.txt`]: "hello",
        [`${EN}/drafts/`]: null,
      })
    );
    assert.equal(result.status, 1, result.stdout);
    assert.deepEqual(
      unreported(result, [
        "iphone-6.9 / en-US / 1.png: not an image name",
        "iphone-6.9 / en-US / 03a.png: not an image name",
        "iphone-6.9 / en-US / 03.PNG: not an image name",
        "iphone-6.9 / en-US / notes.txt: not an image name",
        "iphone-6.9 / en-US / drafts: not an image name",
      ]),
      [],
      result.lines.join("\n")
    );
    assert.equal(result.lines.length, 5, result.lines.join("\n"));
  });

  test("an unknown device folder", () => {
    const result = check(
      makeTree({ ...images(EN, 1), ...images("iphone-6.7/en-US", 1) })
    );
    assert.equal(result.status, 1, result.stdout);
    assert.deepEqual(
      unreported(result, [
        "iphone-6.7: unknown device folder (known: iphone-6.9)",
      ]),
      [],
      result.lines.join("\n")
    );
  });

  test("a file where a Listing locale folder belongs", () => {
    const result = check(
      makeTree({ ...images(EN, 1), "iphone-6.9/01.png": png() })
    );
    assert.equal(result.status, 1, result.stdout);
    assert.deepEqual(
      unreported(result, ["iphone-6.9 / 01.png: not a Listing locale folder"]),
      [],
      result.lines.join("\n")
    );
  });
});

const withImage = (bytes, set = EN) => ({
  ...images(set, 2),
  [`${set}/02.png`]: bytes,
});

describe("check rejects (images)", () => {
  test("the wrong size", () => {
    const result = check(
      makeTree(withImage(png({ height: 2622, width: 1206 })))
    );
    assert.equal(result.status, 1, result.stdout);
    assert.deepEqual(
      unreported(result, [
        "iphone-6.9 / en-US / 02.png: 1206×2622, needs exactly 1320×2868",
      ]),
      [],
      result.lines.join("\n")
    );
  });

  test("landscape", () => {
    const result = check(
      makeTree(withImage(png({ height: WIDTH, width: HEIGHT })))
    );
    assert.equal(result.status, 1, result.stdout);
    assert.deepEqual(
      unreported(result, [
        "iphone-6.9 / en-US / 02.png: landscape (2868×1320), needs portrait 1320×2868",
      ]),
      [],
      result.lines.join("\n")
    );
  });

  test("non-PNG bytes under .png", () => {
    const result = check(
      makeTree(
        withImage(Buffer.from("\xff\xd8\xff\xe0 a JPEG really", "latin1"))
      )
    );
    assert.equal(result.status, 1, result.stdout);
    assert.deepEqual(
      unreported(result, ["iphone-6.9 / en-US / 02.png: not a PNG"]),
      [],
      result.lines.join("\n")
    );
  });

  test("a truncated PNG", () => {
    const whole = png();
    const result = check(
      makeTree(withImage(whole.subarray(0, Math.floor(whole.length / 2))))
    );
    assert.equal(result.status, 1, result.stdout);
    assert.deepEqual(
      unreported(result, [
        "iphone-6.9 / en-US / 02.png: doesn't decode as a PNG",
      ]),
      [],
      result.lines.join("\n")
    );
  });

  test("a PNG whose image data is cut short", () => {
    // Every chunk well formed, but the pixels stop half way down.
    const ihdr = png().subarray(8, 8 + 25);
    const rowBytes = 1 + WIDTH * 3;
    const half = zlib.deflateSync(Buffer.alloc(rowBytes * (HEIGHT / 2)));
    const bytes = Buffer.concat([
      png().subarray(0, 8),
      ihdr,
      chunk("IDAT", half),
      chunk("IEND"),
    ]);
    const result = check(makeTree(withImage(bytes)));
    assert.equal(result.status, 1, result.stdout);
    assert.deepEqual(
      unreported(result, [
        "iphone-6.9 / en-US / 02.png: doesn't decode as a PNG",
      ]),
      [],
      result.lines.join("\n")
    );
  });

  test("image data that runs long", () => {
    const rowBytes = 1 + WIDTH * 3;
    const bytes = Buffer.concat([
      png().subarray(0, 8 + 25),
      chunk("IDAT", zlib.deflateSync(Buffer.alloc(rowBytes * (HEIGHT + 2)))),
      chunk("IEND"),
    ]);
    const result = check(makeTree(withImage(bytes)));
    assert.equal(result.status, 1, result.stdout);
    assert.deepEqual(
      unreported(result, [
        "iphone-6.9 / en-US / 02.png: doesn't decode as a PNG (its image data is too long)",
      ]),
      [],
      result.lines.join("\n")
    );
  });

  test("a header claiming the largest size a PNG allows", () => {
    // Reported as undecodable, never decoded into memory.
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(1, 0);
    ihdr.writeUInt32BE(2 ** 31 - 1, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    const bytes = Buffer.concat([
      png().subarray(0, 8),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(Buffer.alloc(8))),
      chunk("IEND"),
    ]);
    const result = check(makeTree(withImage(bytes)));
    assert.equal(result.status, 1, result.stdout);
    assert.deepEqual(
      unreported(result, [
        "iphone-6.9 / en-US / 02.png: doesn't decode as a PNG",
      ]),
      [],
      result.lines.join("\n")
    );
  });

  test("bytes after the IEND chunk", () => {
    const bytes = Buffer.concat([png(), Buffer.from("trailing")]);
    const result = check(makeTree(withImage(bytes)));
    assert.equal(result.status, 1, result.stdout);
    assert.deepEqual(
      unreported(result, [
        "iphone-6.9 / en-US / 02.png: doesn't decode as a PNG",
      ]),
      [],
      result.lines.join("\n")
    );
  });

  test("a corrupt chunk", () => {
    const bytes = Buffer.from(png());
    bytes[45] = 255 - bytes[45]; // inside IDAT: its CRC no longer matches
    const result = check(makeTree(withImage(bytes)));
    assert.equal(result.status, 1, result.stdout);
    assert.deepEqual(
      unreported(result, [
        "iphone-6.9 / en-US / 02.png: doesn't decode as a PNG",
      ]),
      [],
      result.lines.join("\n")
    );
  });

  test("an alpha channel, even when fully opaque", () => {
    const result = check(
      makeTree({
        ...withImage(png({ colorType: 6 })),
        ...withImage(png({ colorType: 4 }), UK),
      })
    );
    assert.equal(result.status, 1, result.stdout);
    assert.deepEqual(
      unreported(result, [
        "iphone-6.9 / en-US / 02.png: has an alpha channel",
        "iphone-6.9 / uk / 02.png: has an alpha channel",
      ]),
      [],
      result.lines.join("\n")
    );
  });

  test("transparency without an alpha channel", () => {
    const result = check(makeTree(withImage(png({ transparency: true }))));
    assert.equal(result.status, 1, result.stdout);
    assert.deepEqual(
      unreported(result, [
        "iphone-6.9 / en-US / 02.png: has transparency (a tRNS chunk)",
      ]),
      [],
      result.lines.join("\n")
    );
  });

  test("every failure, across sets, not just the first", () => {
    const result = check(
      makeTree({
        ...withImage(png({ colorType: 6 })),
        ...images(UK, 11),
        [`${UK}/03.png`]: png({ width: 1 }),
        "iphone-6.7/en-US/01.png": png(),
      })
    );
    assert.equal(result.status, 1, result.stdout);
    assert.deepEqual(
      unreported(result, [
        "iphone-6.7: unknown device folder",
        "iphone-6.9 / en-US / 02.png: has an alpha channel",
        "iphone-6.9 / uk: 11 images",
        "iphone-6.9 / uk / 03.png: 1×2868",
      ]),
      [],
      result.lines.join("\n")
    );
    assert.equal(result.lines.length, 4, result.lines.join("\n"));
  });
});

describe("the command line", () => {
  test("refuses an unknown command", () => {
    const result = run("push");
    assert.equal(result.status, 2);
    assert.ok(result.lines[0].startsWith("Usage:"));
  });

  test("fails on a directory that isn't there", () => {
    const missing = path.join(makeTree({}), "nope");
    const result = check(missing);
    assert.equal(result.status, 1);
    assert.deepEqual(result.lines, [`${missing}: no such directory`]);
  });
});
