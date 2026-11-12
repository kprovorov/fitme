/** A markdown list marker: `- `, `* `, `• `, `1. ` or `1) `. */
const LIST_MARKER = /^\s*(?:[-*•]|\d+[.)])\s*/u;

/**
 * An Exercise's instructions, which the Library writes as a markdown list
 * (`- step` or `1. step` lines), as plain steps: markers and blank lines gone.
 */
export const instructionSteps = (instructions: string): string[] =>
  instructions
    .split("\n")
    .map((line) => line.replace(LIST_MARKER, "").trim())
    .filter((line) => line.length > 0);
