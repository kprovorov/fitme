/**
 * Items as rows with a stable key each: an item can repeat ("Repeat."), so
 * its key counts the times it came before.
 */
export const keyedRows = (
  items: readonly string[]
): { key: string; number: number; text: string }[] => {
  const seen = new Map<string, number>();

  return items.map((text, index) => {
    const repeat = seen.get(text) ?? 0;
    seen.set(text, repeat + 1);

    return { key: `${text}#${repeat}`, number: index + 1, text };
  });
};
