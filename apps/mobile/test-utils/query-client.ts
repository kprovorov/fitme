import {
  defaultScheduler,
  notifyManager,
  QueryClient,
} from "@tanstack/react-query";
import { act } from "@testing-library/react-native";

const clients = new Set<QueryClient>();

// A completed fetch can still have a queued observer notification. That
// notification renders its data and can mount the next dependent query.
const pendingNotifications = new Set<object>();

notifyManager.setScheduler((notify) => {
  const notification = {};
  pendingNotifications.add(notification);
  defaultScheduler(() => {
    try {
      notify();
    } finally {
      pendingNotifications.delete(notification);
    }
  });
});

/**
 * A QueryClient for one test: no retries (a query's own `retry` still
 * applies) and no garbage collection. A gc timer outlives the test (5 minutes
 * by default, for queries and mutations alike) and keeps Jest from exiting.
 * `test-utils/after-each.ts` clears every client after each test.
 */
export const createTestQueryClient = () => {
  const client = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: Number.POSITIVE_INFINITY, retry: false },
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });

  clients.add(client);

  return client;
};

export const clearTestQueryClients = () => {
  for (const client of clients) {
    client.clear();
  }

  clients.clear();
  // Fake-timer tests can discard a notification when returning to real timers.
  pendingNotifications.clear();
};

/** More than any test needs: hitting it means something never settles. */
const MAX_TICKS = 2000;

const nextMacrotask = () =>
  act(async () => {
    const { promise, resolve } = Promise.withResolvers<undefined>();
    setTimeout(resolve, 0, undefined);
    await promise;
  });

/**
 * Waits until `condition` holds, one macrotask at a time inside `act`: for
 * what `settle` can't wait on, such as a request held by a paused backend.
 * Real timers only.
 */
export const until = async (condition: () => boolean) => {
  const check = async (tick: number): Promise<void> => {
    if (tick === MAX_TICKS) {
      throw new Error(`Condition still false after ${MAX_TICKS} ticks`);
    }

    if (condition()) {
      return;
    }

    await nextMacrotask();

    await check(tick + 1);
  };

  await check(0);
};

/**
 * Waits until nothing is fetching, mutating or queued to notify observers and
 * `isIdle` holds, one macrotask at a time inside `act`. Idle has to hold on two ticks in a row:
 * react-query renders a response a tick after it lands, and that render can
 * start the next query (a row's Exercise lookup once a session's rows arrive).
 *
 * Counts ticks rather than milliseconds, so a busy machine makes it slower but
 * never fails it, unlike `waitFor`'s 1 s limit. Real timers only: under fake
 * timers no tick ever passes.
 */
export const settle = async (
  client: QueryClient,
  isIdle: () => boolean = () => true
) => {
  let idleTicks = 0;

  const check = async (tick: number): Promise<void> => {
    if (tick === MAX_TICKS) {
      throw new Error(
        `Not settled after ${MAX_TICKS} ticks: ${client.isFetching()} fetching, ${client.isMutating()} mutating`
      );
    }

    await nextMacrotask();

    const idle =
      client.isFetching() === 0 &&
      client.isMutating() === 0 &&
      pendingNotifications.size === 0 &&
      isIdle();

    idleTicks = idle ? idleTicks + 1 : 0;

    if (idleTicks === 2) {
      return;
    }

    await check(tick + 1);
  };

  await check(0);
};
