/**
 * The expected note of a note write as the stored text compares to it: blank
 * text (or `null`) counts as no note. Shared by Exercise notes and set notes,
 * which follow the same expected-note rule.
 */
export const expectedNoteText = (expected: string | null): string | null => {
  const text = expected?.trim() ?? "";

  return text === "" ? null : text;
};
