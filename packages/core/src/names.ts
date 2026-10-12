/**
 * Splits a full name on its first space into Clerk's first and last name; a
 * single word becomes the first name.
 */
export function splitName(name: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = name.trim();
  const separator = trimmed.indexOf(" ");
  if (separator === -1) {
    return { firstName: trimmed, lastName: "" };
  }
  return {
    firstName: trimmed.slice(0, separator),
    lastName: trimmed.slice(separator + 1).trim(),
  };
}
