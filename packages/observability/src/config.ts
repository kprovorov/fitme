const PRODUCTION_TRACES_SAMPLE_RATE = 0.2;
const DEFAULT_TRACES_SAMPLE_RATE = 1;

export interface ObservabilityConfig {
  /** Unset when there's nothing to send to. */
  dsn: string | undefined;
  /** False without a DSN: local runs, tests and CI send nothing. */
  enabled: boolean;
  /** `VERCEL_ENV` (`production`, `preview`); `development` outside Vercel. */
  environment: string;
  /** The commit the build came from (`VERCEL_GIT_COMMIT_SHA`). */
  release: string | undefined;
  tracesSampleRate: number;
}

export interface ObservabilityEnv {
  VERCEL_ENV?: string;
  VERCEL_GIT_COMMIT_SHA?: string;
}

/**
 * The environment, release and sampling every app reports with. Each platform
 * passes its own DSN (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, …) and Vercel's
 * variables (under their public prefix in a browser bundle): production
 * samples 20% of traces, preview (and anything else with a DSN) all of them.
 */
export const resolveObservabilityConfig = ({
  dsn,
  env,
}: {
  dsn: string | undefined;
  env: ObservabilityEnv;
}): ObservabilityConfig => {
  const environment = env.VERCEL_ENV || "development";
  const release = env.VERCEL_GIT_COMMIT_SHA || undefined;
  if (!dsn) {
    return {
      dsn: undefined,
      enabled: false,
      environment,
      release,
      tracesSampleRate: 0,
    };
  }
  return {
    dsn,
    enabled: true,
    environment,
    release,
    tracesSampleRate:
      environment === "production"
        ? PRODUCTION_TRACES_SAMPLE_RATE
        : DEFAULT_TRACES_SAMPLE_RATE,
  };
};
