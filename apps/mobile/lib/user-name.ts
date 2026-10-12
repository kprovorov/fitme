/** Splits a full name on its first space into Clerk's first and last name. */
export const splitFullName = (name: string) => {
  const trimmed = name.trim();
  const separator = trimmed.indexOf(" ");
  if (separator === -1) {
    return { firstName: trimmed, lastName: "" };
  }
  return {
    firstName: trimmed.slice(0, separator),
    lastName: trimmed.slice(separator + 1).trim(),
  };
};

export interface ProfileIdentity {
  /** Letter for the avatar. */
  initial: string;
  subtitle?: string;
  title: string;
}

/** What the Profile tab header shows for a User. */
export const getProfileIdentity = ({
  email,
  fullName,
}: {
  email?: string | null;
  fullName?: string | null;
}): ProfileIdentity => {
  const name = fullName?.trim() ?? "";
  if (!name) {
    // Most migrated Users have no name in Clerk until they add one.
    const title = email ?? "";
    return { initial: title.charAt(0).toUpperCase(), title };
  }
  return {
    initial: name.charAt(0).toUpperCase(),
    subtitle: email ?? undefined,
    title: name,
  };
};
