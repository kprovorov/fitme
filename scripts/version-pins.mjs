/// <reference types="node" />
/// <reference lib="es2023.array" />

// Node and pnpm are pinned in several places that have to agree: the root
// manifest (devEngines.runtime, packageManager), each Vercel app's
// engines.node, the mobile EAS base profile, the lockfile's resolved Node and
// every workspace's @types/node. versionPinProblems lists every way they
// disagree, one line each naming the file, the field and both values; an
// empty list means they're in step. A version bump lands in the root manifest
// first (then `pnpm install` for the lockfile), then in every copy this lists.
import fs from "node:fs";
import path from "node:path";

const ROOT_MANIFEST = "package.json";
const EAS_PROFILE = "apps/mobile/eas.json";
const LOCKFILE = "pnpm-lock.yaml";
const WORKSPACE_DIRS = ["apps", "packages"];

// The root importer's `node` entry in the lockfile: pnpm records the version
// devEngines.runtime resolved to as `version: runtime:<x.y.z>`.
// The root importer's block: from `  .:` under `importers:` to the next
// importer (or the end). pnpm 12's lockfile opens with an env document that
// has a root importer of its own (packageManagerDependencies), so there are
// two of them.
const ROOT_IMPORTER = /^importers:\n\n {2}\.:\n(?<body>(?: {4}.*\n|\n)*)/gmu;

const LOCKFILE_NODE =
  /^ {6}node:\n {8}specifier: runtime:\S+\n {8}version: runtime:(?<version>\S+)$/mu;

const EXACT_VERSION = /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$/u;
const CARET_RANGE = /^\^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$/u;
const PACKAGE_MANAGER = /^pnpm@(?<version>\S+)$/u;
const MAJOR = /^[\^~]?(?<major>\d+)\./u;

/**
 * @param {unknown} value Parsed JSON value.
 * @param {string[]} keys Path to follow.
 * @returns {unknown} The value at that path, or undefined.
 */
const at = (value, ...keys) => {
  let current = value;

  for (const key of keys) {
    if (!(current instanceof Object) || Array.isArray(current)) {
      return;
    }

    /** @type {Record<string, unknown>} */
    const object = current;
    current = object[key];
  }

  return current;
};

/**
 * @param {unknown} value Parsed JSON value.
 * @returns {string | undefined} The value as text, or undefined for a missing value or an object.
 */
const asText = (value) =>
  value === undefined || value === null || value instanceof Object
    ? undefined
    : JSON.stringify(value).replace(/^"(?<text>.*)"$/u, "$<text>");

/**
 * @param {string} root Repository root.
 * @param {string} file Path relative to it.
 * @returns {unknown} The parsed JSON.
 */
const readJson = (root, file) =>
  /** @type {unknown} */ (
    JSON.parse(fs.readFileSync(path.join(root, file), "utf-8"))
  );

/**
 * @param {RegExp} pattern A pattern with major, minor and patch groups.
 * @param {string} text Text to match.
 * @returns {number[] | null} [major, minor, patch], or null when it doesn't match.
 */
const versionParts = (pattern, text) => {
  const groups = pattern.exec(text)?.groups;

  return groups === undefined
    ? null
    : [Number(groups.major), Number(groups.minor), Number(groups.patch)];
};

/**
 * Whether an exact version satisfies a caret range (`^x.y.z`), the only form
 * devEngines.runtime uses.
 * @param {string} version Exact version.
 * @param {string} range Caret range.
 */
const satisfiesCaret = (version, range) => {
  const wanted = versionParts(CARET_RANGE, range);
  const actual = versionParts(EXACT_VERSION, version);

  if (wanted === null || actual === null) {
    return false;
  }

  const [major, minor, patch] = actual;
  const [wantedMajor, wantedMinor, wantedPatch] = wanted;

  return (
    major === wantedMajor &&
    (minor > wantedMinor || (minor === wantedMinor && patch >= wantedPatch))
  );
};

/** @param {string} version A version or a `^` / `~` specifier. */
const majorOf = (version) => MAJOR.exec(version)?.groups?.major;

/**
 * Package directories under one of the workspace directories.
 * @param {string} root Repository root.
 * @param {string} dir Workspace directory.
 */
const packageDirs = (root, dir) => {
  const full = path.join(root, dir);

  return fs.existsSync(full)
    ? fs
        .readdirSync(full, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${dir}/${entry.name}`)
        .filter((pkg) => fs.existsSync(path.join(root, pkg, "package.json")))
        .toSorted()
    : [];
};

/**
 * @typedef {{ nodeMajor: string, nodeRange: string, pnpmVersion: string | undefined, packageManager: string | undefined }} Pins
 */

/**
 * The root allows Node's major and up, and the apps Vercel deploys (the ones
 * with a vercel.json) declare exactly Node's major.
 * @param {string} root Repository root.
 * @param {Pins} pins The root pins.
 */
const engineProblems = (root, { nodeMajor, nodeRange }) => {
  const source = `${ROOT_MANIFEST} devEngines.runtime ${nodeRange}`;
  const rootWanted = `>=${nodeMajor}`;
  const rootEngines = at(readJson(root, ROOT_MANIFEST), "engines", "node");
  const vercelWanted = `${nodeMajor}.x`;

  return [
    ...(rootEngines === rootWanted
      ? []
      : [
          `${ROOT_MANIFEST} engines.node is ${JSON.stringify(rootEngines)}, not ${JSON.stringify(rootWanted)} (the major of ${source})`,
        ]),
    ...packageDirs(root, "apps")
      .filter((app) => fs.existsSync(path.join(root, app, "vercel.json")))
      .flatMap((app) => {
        const file = `${app}/package.json`;
        const engines = at(readJson(root, file), "engines", "node");

        return engines === vercelWanted
          ? []
          : [
              `${file} engines.node is ${JSON.stringify(engines)}, not ${JSON.stringify(vercelWanted)} (the major of ${source})`,
            ];
      }),
  ];
};

/**
 * The Node the lockfile resolved for the root importer's devEngines.runtime.
 * @param {string} root Repository root.
 * @returns {string | undefined} Its exact version, or undefined without one.
 */
const lockfileNode = (root) => {
  const text = fs
    .readFileSync(path.join(root, LOCKFILE), "utf-8")
    .replaceAll("\r\n", "\n");

  for (const match of text.matchAll(ROOT_IMPORTER)) {
    const version = LOCKFILE_NODE.exec(match.groups?.body ?? "")?.groups
      ?.version;

    if (version !== undefined) {
      return version;
    }
  }
};

/**
 * One EAS profile's Node and pnpm, which EAS needs since it ignores
 * packageManager. The base profile sets both; another only when it overrides.
 * @param {string} name Profile name.
 * @param {unknown} profile The profile.
 * @param {Pins & { lockNode: string | undefined }} pins The root pins.
 */
const easProfileProblems = (
  name,
  profile,
  { lockNode, nodeRange, packageManager, pnpmVersion }
) => {
  const isBase = name === "base";
  const node = asText(at(profile, "node"));
  const pnpm = asText(at(profile, "pnpm"));
  const field = `${EAS_PROFILE} build.${name}`;

  /** @type {string[]} */
  const problems = [];

  if ((isBase || pnpm !== undefined) && pnpm !== pnpmVersion) {
    problems.push(
      `${field}.pnpm is ${JSON.stringify(pnpm)}, not ${JSON.stringify(pnpmVersion)} (${ROOT_MANIFEST} packageManager ${packageManager})`
    );
  }

  if (!isBase && node === undefined) {
    return problems;
  }

  if (!satisfiesCaret(node ?? "", nodeRange)) {
    problems.push(
      `${field}.node is ${JSON.stringify(node)}, outside ${ROOT_MANIFEST} devEngines.runtime ${nodeRange}`
    );
  }

  if (lockNode !== undefined && node !== lockNode) {
    problems.push(
      `${field}.node is ${JSON.stringify(node)}, not ${JSON.stringify(lockNode)} (the Node runtime ${LOCKFILE} resolved)`
    );
  }

  return problems;
};

/**
 * @param {string} root Repository root.
 * @param {Pins} pins The root pins.
 */
const easProblems = (root, pins) => {
  const lockNode = lockfileNode(root);
  const build = at(readJson(root, EAS_PROFILE), "build");

  /** @type {[string, unknown][]} */
  const profiles =
    build instanceof Object && !Array.isArray(build)
      ? Object.entries(build)
      : [];

  if (!profiles.some(([name]) => name === "base")) {
    profiles.unshift(["base", {}]);
  }

  return [
    ...(lockNode === undefined
      ? [
          `${LOCKFILE} has no resolved Node runtime for the root importer: run \`pnpm install\``,
        ]
      : []),
    ...profiles.flatMap(([name, profile]) =>
      easProfileProblems(name, profile, { ...pins, lockNode })
    ),
  ];
};

/**
 * Every workspace that has @types/node has the same one, on Node's major.
 * @param {string} root Repository root.
 * @param {Pins} pins The root pins.
 */
const typesNodeProblems = (root, { nodeMajor, nodeRange }) => {
  const manifests = [
    ROOT_MANIFEST,
    ...WORKSPACE_DIRS.flatMap((dir) =>
      packageDirs(root, dir).map((pkg) => `${pkg}/package.json`)
    ),
  ];

  const declared = manifests.flatMap((file) => {
    const manifest = readJson(root, file);

    const version = asText(
      at(manifest, "dependencies", "@types/node") ??
        at(manifest, "devDependencies", "@types/node")
    );

    return version === undefined ? [] : [{ file, version }];
  });

  // The version most workspaces use is the one the rest are measured against;
  // on a tie, one on Node's major wins, so a half-done bump names the stale
  // workspaces, then the first one met.
  /** @type {Map<string, string[]>} */
  const byVersion = new Map();

  for (const { file, version } of declared) {
    byVersion.set(version, [...(byVersion.get(version) ?? []), file]);
  }

  let shared = "";
  /** @type {string[]} */
  let sharedFiles = [];

  for (const [version, files] of byVersion) {
    const onMajor = majorOf(version) === nodeMajor;
    const sharedOnMajor = majorOf(shared) === nodeMajor;

    if (
      files.length > sharedFiles.length ||
      (files.length === sharedFiles.length && onMajor && !sharedOnMajor)
    ) {
      shared = version;
      sharedFiles = files;
    }
  }

  return declared.flatMap(({ file, version }) => {
    if (version !== shared) {
      return [
        `${file} @types/node is ${JSON.stringify(version)}, not ${JSON.stringify(shared)} (${sharedFiles[0]} and the other workspaces)`,
      ];
    }

    return majorOf(version) === nodeMajor
      ? []
      : [
          `${file} @types/node is ${JSON.stringify(version)}, not on Node's major ${nodeMajor} (${ROOT_MANIFEST} devEngines.runtime ${nodeRange})`,
        ];
  });
};

/** @param {string} root Repository root. */
export const versionPinProblems = (root) => {
  const manifest = readJson(root, ROOT_MANIFEST);
  const nodeRange = asText(at(manifest, "devEngines", "runtime", "version"));
  const nodeMajor = versionParts(CARET_RANGE, nodeRange ?? "")?.[0];

  if (nodeRange === undefined || nodeMajor === undefined) {
    return [
      `${ROOT_MANIFEST} devEngines.runtime.version is ${JSON.stringify(nodeRange)}, not a caret range (^x.y.z)`,
    ];
  }

  const packageManager = asText(at(manifest, "packageManager"));

  /** @type {Pins} */
  const pins = {
    nodeMajor: String(nodeMajor),
    nodeRange,
    packageManager,
    pnpmVersion: PACKAGE_MANAGER.exec(packageManager ?? "")?.groups?.version,
  };

  return [
    ...engineProblems(root, pins),
    ...easProblems(root, pins),
    ...typesNodeProblems(root, pins),
  ];
};
