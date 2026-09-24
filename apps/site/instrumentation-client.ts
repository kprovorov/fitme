import posthog from "posthog-js";

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "", {
  api_host: "/ingest",
  capture_exceptions: true, // This enables capturing exceptions using Error Tracking
  debug: process.env.NODE_ENV === "development",
  defaults: "2025-05-24",
  ui_host: "https://eu.posthog.com",
});
