import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "~/lib/observability";

// Server-side Sentry (Node and edge): runs once per server instance, before
// any request. Without NEXT_PUBLIC_SENTRY_DSN nothing is sent.
export function register() {
  Sentry.init(sentryOptions());
}

// Errors thrown by Server Components, route handlers, server actions and the
// request proxy.
export const onRequestError = Sentry.captureRequestError;
