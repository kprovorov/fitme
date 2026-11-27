/**
 * The fake analytics SDK: the stand-in `test-utils/setup.ts` puts in place of
 * `posthog-react-native` for every test file, recording what reached it.
 * `after-each.ts` empties it after each test (`resetSentAnalytics`).
 *
 * Tests read it through `sentAnalytics`, whose names say what the app sent
 * and never which vendor took it, so the package underneath can change
 * without a test changing. Only the members the app uses are here, so a new
 * one the app reaches for fails its test rather than silently doing nothing.
 */
import type { AnalyticsClientOptions } from "~/lib/analytics";

/**
 * The PostHog key every test runs with: `setup.ts` sets it and `after-each.ts`
 * puts it back, so the wrapper builds its client over this fake.
 */
export const TEST_POSTHOG_KEY = "phc_test";

/** A property's or trait's value, as the app sends them: never nested. */
type PropertyValue = boolean | number | string | null | undefined;

type Properties = Readonly<Record<string, PropertyValue>>;

export interface SentEvent {
  name: string;
  properties: Properties | undefined;
}

export interface SentIdentify {
  traits: Properties | undefined;
  userId: string | undefined;
}

/** A client the app built: the key it was given and its options as passed. */
export interface BuiltClient {
  key: string;
  options: AnalyticsClientOptions | undefined;
}

interface Recorded {
  /** Names of the events captured while nobody was identified. */
  anonymous: string[];
  clients: BuiltClient[];
  events: SentEvent[];
  identifies: SentIdentify[];
  resets: number;
  screens: string[];
}

const empty = (): Recorded => ({
  anonymous: [],
  clients: [],
  events: [],
  identifies: [],
  resets: 0,
  screens: [],
});

let recorded = empty();

/** The id the SDK would send events under: the last identify's, until a reset. */
let identifiedAs: string | undefined;

/** What reached the analytics SDK in this test, oldest first. */
export const sentAnalytics = {
  /**
   * The names of the events sent while nobody was identified (before the
   * first identify, or after a reset), so under the anonymous id.
   */
  anonymousEvents: (): readonly string[] => [...recorded.anonymous],
  /** Each client built, with the key and options it was built with. */
  clients: (): readonly BuiltClient[] => [...recorded.clients],
  /** Each event sent: its name and properties. */
  events: (): readonly SentEvent[] => [...recorded.events],
  /** Each User identified, with what they're known by. */
  identifies: (): readonly SentIdentify[] => [...recorded.identifies],
  /** How many times the identity was reset. */
  resets: (): number => recorded.resets,
  /** Each screen recorded, by name. */
  screens: (): readonly string[] => [...recorded.screens],
};

/** Back to nothing sent; run by `after-each.ts`. */
export const resetSentAnalytics = (): void => {
  recorded = empty();
  identifiedAs = undefined;
};

const client = {
  capture: (name: string, properties?: Properties): void => {
    recorded.events.push({ name, properties });

    if (identifiedAs === undefined) {
      recorded.anonymous.push(name);
    }
  },
  identify: (userId?: string, traits?: Properties): void => {
    recorded.identifies.push({ traits, userId });
    identifiedAs = userId;
  },
  reset: (): void => {
    recorded.resets += 1;
    identifiedAs = undefined;
  },
  screen: (name: string): Promise<void> => {
    recorded.screens.push(name);

    return Promise.resolve();
  },
};

/**
 * The SDK's client class: `new` records the key and options it was given and
 * answers the one recording client (a constructor returning an object answers
 * that object).
 */
// oxlint-disable-next-line func-style -- `new` needs a function, not an arrow.
function FakePostHog(key: string, options?: AnalyticsClientOptions) {
  recorded.clients.push({ key, options });

  return client;
}

/** `posthog-react-native` as `setup.ts` mocks it: the client class, recording. */
export const analyticsSdkModule = {
  __esModule: true,
  default: FakePostHog,
  PostHog: FakePostHog,
};
