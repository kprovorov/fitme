/**
 * Our own services: the only hosts that get trace headers (`sentry-trace`,
 * `baggage`). Listed one by one, not `*.fitmeproject.com`: Clerk's Frontend
 * API answers on clerk.fitmeproject.com.
 */
const SERVICES = ["api", "app", "coach", "exercises", "mcp", "webhooks"];

/**
 * `tracePropagationTargets` for every app: our services, localhost (local
 * stacks), and same-origin relative paths (the web app calling its own
 * server). Clerk, RevenueCat, Supabase and every other third party are left
 * out. Sentry tests each pattern against the request URL.
 */
export const tracePropagationTargets: RegExp[] = [
  new RegExp(
    `^https://(?:${SERVICES.join("|")})\\.fitmeproject\\.com(?:[/?#]|$)`
  ),
  /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:[/?#]|$)/,
  /^\/(?!\/)/,
];
