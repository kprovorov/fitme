const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/** `app.json`'s committed version; release builds get the tag's version. */
const DEV_PLACEHOLDER_VERSION = "0.0.0";

const parseVersion = (version: string) => {
  const trimmed = version.trim();
  return VERSION_PATTERN.test(trimmed) ? trimmed.split(".").map(Number) : null;
};

/**
 * Whether the installed app `version` is older than the `minimum` supported
 * one. Anything it can't judge (no minimum, an unreadable version, the dev
 * placeholder) never blocks.
 */
export const isBelowMinimumVersion = (
  version: string | null | undefined,
  minimum: string | null | undefined
): boolean => {
  if (!(version && minimum) || version === DEV_PLACEHOLDER_VERSION) {
    return false;
  }
  const current = parseVersion(version);
  const required = parseVersion(minimum);
  if (!(current && required)) {
    return false;
  }
  for (const [index, part] of current.entries()) {
    if (part !== required[index]) {
      return part < required[index];
    }
  }
  return false;
};
