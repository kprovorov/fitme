"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

// Replaces the root layout when it (or anything above a nested error
// boundary) throws while rendering in the browser; reports the error.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        {/* App Router has no status code for errors: 0 renders the generic message. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
