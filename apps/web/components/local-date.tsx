"use client";

import { format } from "date-fns";

/**
 * Renders a timestamp as a date in the browser's time zone. The server
 * pre-renders it in its own zone, so hydration may correct the text.
 */
export function LocalDate({ value }: { value: string }) {
  return (
    <time dateTime={value} suppressHydrationWarning>
      {format(new Date(value), "PP")}
    </time>
  );
}
