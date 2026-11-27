/**
 * The fake analytics SDK: the stand-in `test-utils/setup.ts` puts in place of
 * the analytics SDK package for every test file, recording what reached it.
 * `after-each.ts` empties it after each test (`resetSentAnalytics`).
 *
 * Tests read it through `sentAnalytics`, whose names say what the app sent
 * and never which vendor took it, so the package underneath can change
 * without a test changing. Only the members the app uses are here, so a new
 * one the app reaches for fails its test rather than silently doing nothing.
 */
import type { ReactNode } from "react";

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

interface Recorded {
  events: SentEvent[];
  identifies: SentIdentify[];
  resets: number;
  screens: string[];
}

const empty = (): Recorded => ({
  events: [],
  identifies: [],
  resets: 0,
  screens: [],
});

let recorded = empty();

/** What reached the analytics SDK in this test, oldest first. */
export const sentAnalytics = {
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
};

const client = {
  identify: (userId?: string, traits?: Properties): Promise<void> => {
    recorded.identifies.push({ traits, userId });

    return Promise.resolve();
  },
  reset: (): Promise<void> => {
    recorded.resets += 1;

    return Promise.resolve();
  },
  screen: (name: string): Promise<void> => {
    recorded.screens.push(name);

    return Promise.resolve();
  },
  track: (name: string, properties?: Properties): Promise<void> => {
    recorded.events.push({ name, properties });

    return Promise.resolve();
  },
};

/** The SDK package as `setup.ts` mocks it: one client, recording. */
export const analyticsSdkModule = {
  AnalyticsProvider: ({ children }: { children: ReactNode }) => children,
  createClient: () => client,
};
