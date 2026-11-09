/* oxlint-disable eslint/max-classes-per-file -- A directory lists its files and a file copies into a directory, so splitting the two would make the modules import each other. */

/**
 * An in-memory stand-in for `expo-file-system`, for the code that keeps the
 * device copy of a sent Attachment (`~/lib/arnold-sent-attachments`).
 *
 * jest-expo's own stand-in answers `exists: false` for everything and stores
 * nothing, so a test over it can't see what the app wrote. This one keeps the
 * files in a map, so a test reads what went onto the device, and whether a
 * reset took it away again.
 *
 * A test file stands the module in with it and seeds the files the native
 * side would have written:
 *
 * ```ts
 * jest.mock("expo-file-system", () =>
 *   jest.requireActual<typeof import("~/test-utils/in-memory-file-system")>(
 *     "~/test-utils/in-memory-file-system"
 *   ).fileSystemModule
 * );
 * ```
 *
 * `fileSystem` is the device behind it: `reset()` in a `beforeEach`, `write`
 * to seed a picked photo, `read` and `filesUnder` to read back what the app
 * wrote. Only the members the app uses are implemented; anything else is
 * missing rather than a silent no-op, so a new call site fails its test.
 */

/** Where the stand-in's document and cache directories live. */
const DOCUMENT_URI = "file:///memory/document";
const CACHE_URI = "file:///memory/cache";

/** The shortest uri that still has a parent, so walking up terminates. */
const ROOT_URI = "file://";

/** Joins a parent path with the segments under it, as the native side does. */
const join = (base: string, segments: readonly string[]): string =>
  [
    base.replace(/\/+$/u, ""),
    ...segments.map((part) => part.replace(/^\/+/u, "")),
  ]
    .filter((part) => part !== "")
    .join("/");

/** Every file on the stand-in device, by uri, holding its contents. */
const contents = new Map<string, string>();

/** The directories created so far, so an empty one still exists. */
const directories = new Set<string>([DOCUMENT_URI, CACHE_URI]);

const parentOf = (uri: string): string =>
  uri.slice(0, Math.max(0, uri.lastIndexOf("/")));

const isUnder = (uri: string, directory: string): boolean =>
  uri.startsWith(`${directory}/`);

/** Creates `uri` and every directory above it. */
const addDirectories = (uri: string): void => {
  for (
    let directory = uri;
    directory.length > ROOT_URI.length;
    directory = parentOf(directory)
  ) {
    directories.add(directory);
  }
};

/** A copy a test is holding part-way through, so it sees the device mid-write. */
interface CopyHold {
  release: () => void;
  started: () => void;
  waitFor: Promise<undefined>;
}

let hold: CopyHold | undefined;

/** What a test does with the stand-in device. */
export const fileSystem = {
  /** The file uris under `directory`, at any depth, sorted. */
  filesUnder: (directory: string): string[] =>
    [...contents.keys()].filter((uri) => isUnder(uri, directory)).toSorted(),

  /**
   * Holds the next copy until `release` is called, so a test acts while a
   * send is part-way through writing its device copies. `started` resolves
   * once the copy has been asked for.
   */
  holdNextCopy: (): { release: () => void; started: Promise<undefined> } => {
    const gate = Promise.withResolvers<undefined>();
    const begun = Promise.withResolvers<undefined>();

    hold = {
      release: () => gate.resolve(undefined),
      started: () => begun.resolve(undefined),
      waitFor: gate.promise,
    };

    return { release: () => gate.resolve(undefined), started: begun.promise };
  },

  /** A file's contents, or `undefined` when there is no such file. */
  read: (uri: string): string | undefined => contents.get(uri),

  /**
   * Takes a file off the device behind the app's back: a photo iOS purged,
   * or one a Conversation carried onto a phone that never had it.
   */
  remove: (uri: string): void => {
    contents.delete(uri);
  },

  /** Empties the device. */
  reset: (): void => {
    contents.clear();
    directories.clear();
    directories.add(DOCUMENT_URI);
    directories.add(CACHE_URI);
    hold?.release();
    hold = undefined;
  },

  /** Writes a file, creating the directories above it: a picked photo. */
  write: (uri: string, text: string): void => {
    addDirectories(parentOf(uri));
    contents.set(uri, text);
  },
};

type Node = InMemoryDirectory | InMemoryFile;

const uriOf = (parts: readonly (Node | string)[]): string => {
  const [first, ...rest] = parts;

  if (first === undefined) {
    throw new Error("in-memory file system: a path needs at least one part");
  }

  const base = typeof first === "string" ? first : first.uri;

  return rest.length === 0 ? base : join(base, rest.map(String));
};

const missing = (kind: string, uri: string) =>
  new Error(`in-memory file system: no such ${kind} ${uri}`);

class InMemoryFile {
  readonly uri: string;

  constructor(...parts: (Node | string)[]) {
    this.uri = uriOf(parts);
  }

  get name(): string {
    return this.uri.slice(this.uri.lastIndexOf("/") + 1);
  }

  get exists(): boolean {
    return contents.has(this.uri);
  }

  base64(): Promise<string> {
    const text = contents.get(this.uri);

    return text === undefined
      ? Promise.reject(missing("file", this.uri))
      : Promise.resolve(Buffer.from(text).toString("base64"));
  }

  async copy(destination: InMemoryFile): Promise<void> {
    const held = hold;

    if (held) {
      hold = undefined;
      held.started();
      await held.waitFor;
    }

    const text = contents.get(this.uri);

    if (text === undefined) {
      throw missing("file", this.uri);
    }

    const parent = parentOf(destination.uri);

    if (!directories.has(parent)) {
      throw missing("directory", parent);
    }

    contents.set(destination.uri, text);
  }

  delete(): void {
    if (!this.exists) {
      throw missing("file", this.uri);
    }

    contents.delete(this.uri);
  }
}

class InMemoryDirectory {
  readonly uri: string;

  constructor(...parts: (Node | string)[]) {
    this.uri = uriOf(parts).replace(/\/+$/u, "");
  }

  get name(): string {
    return this.uri.slice(this.uri.lastIndexOf("/") + 1);
  }

  get exists(): boolean {
    return directories.has(this.uri);
  }

  create(options: { intermediates?: boolean } = {}): void {
    const parent = parentOf(this.uri);

    if (!(options.intermediates || directories.has(parent))) {
      throw missing("directory", parent);
    }

    addDirectories(this.uri);
  }

  delete(): void {
    if (!this.exists) {
      throw missing("directory", this.uri);
    }

    for (const uri of contents.keys()) {
      if (isUnder(uri, this.uri)) {
        contents.delete(uri);
      }
    }

    for (const uri of directories) {
      if (uri === this.uri || isUnder(uri, this.uri)) {
        directories.delete(uri);
      }
    }
  }

  /** Its direct children, directories and files alike, as the native one. */
  list(): Node[] {
    if (!this.exists) {
      throw missing("directory", this.uri);
    }

    const children: Node[] = [];

    for (const uri of directories) {
      if (parentOf(uri) === this.uri) {
        children.push(new InMemoryDirectory(uri));
      }
    }

    for (const uri of contents.keys()) {
      if (parentOf(uri) === this.uri) {
        children.push(new InMemoryFile(uri));
      }
    }

    return children;
  }

  /**
   * Moves this directory's contents into `destination`, which the native one
   * would instead nest this directory inside when it already exists. The app
   * only ever moves into a directory that doesn't, so the difference never
   * shows; a call site that would rely on nesting needs this made faithful.
   */
  moveSync(destination: InMemoryDirectory): void {
    if (!this.exists) {
      throw missing("directory", this.uri);
    }

    destination.create({ intermediates: true });

    // Snapshot first: a moved file lands on a key this iteration would
    // otherwise reach again.
    const moving = [...contents].filter(([uri]) => isUnder(uri, this.uri));

    for (const [uri, text] of moving) {
      contents.delete(uri);
      contents.set(`${destination.uri}${uri.slice(this.uri.length)}`, text);
    }

    this.delete();
  }
}

/** The module's own shape: what a test hands `jest.mock("expo-file-system")`. */
export const fileSystemModule = {
  Directory: InMemoryDirectory,
  File: InMemoryFile,
  Paths: {
    get cache() {
      return new InMemoryDirectory(CACHE_URI);
    },
    get document() {
      return new InMemoryDirectory(DOCUMENT_URI);
    },
  },
};
