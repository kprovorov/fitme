import type * as EveContext from "eve/context";
import type {
  HookContext,
  HookDefinition,
  HookEvent,
  HookEventMap,
  StreamEventHook,
} from "eve/hooks";

/** Each state slot's reset, so `resetState()` can clear them all. */
const resets = new Set<() => void>();

/**
 * Stands in for `eve/context` in a hook test (`vi.mock("eve/context", () =>
 * testState)`): `defineState` outside eve has no context to read, so each
 * slot lives in memory here, and `resetState()` clears them before a test.
 */
export const testState: Pick<typeof EveContext, "defineState"> = {
  defineState: <T>(_name: string, initial: () => T) => {
    let slot: { value: T } | null = null;
    resets.add(() => {
      slot = null;
    });

    const current = (): { value: T } => {
      slot ??= { value: initial() };

      return slot;
    };

    return {
      get: () => current().value,
      update(fn: (value: T) => T) {
        current().value = fn(current().value);
      },
    };
  },
};

export const resetState = (): void => {
  for (const reset of resets) {
    reset();
  }
};

/** An eve event as a hook receives it. */
type StampedEvent = HookEventMap[keyof HookEventMap];

/**
 * An eve event as a test writes it: its `type` and `data`, as the stream
 * carries them. `emit` stamps the `meta` eve adds before a hook sees it.
 */
export type EveEvent = Unstamped<StampedEvent>;

type Unstamped<Event> = Event extends unknown ? Omit<Event, "meta"> : never;

/** What one event did to the session's turn. */
export interface Emitted {
  /** The hook cancelled the running turn. */
  readonly cancelled: boolean;
}

const unavailableInTest = (): never => {
  throw new Error("This hook context has no runtime services");
};

/**
 * One session a hook runs in: `emit` hands an event to the hook as eve does,
 * the handler subscribed to its type first, then `*`. An event the hook
 * doesn't subscribe to does nothing, so a hook listening for a renamed event
 * never fires and the test expecting it fails.
 */
export const hookSession = (hook: HookDefinition, sessionId = "wrun_1") => {
  let cancels = 0;
  let eventCount = 0;

  const ctx: HookContext = {
    agent: { name: "arnold" },
    cancel: () => {
      cancels += 1;
    },
    channel: { kind: "eve" },
    getSandbox: unavailableInTest,
    session: {
      auth: { current: null, initiator: null },
      id: sessionId,
      turn: { id: "turn_1", sequence: 1 },
    },
  };

  // SAFETY: eve hands each event only to the handler keyed by that event's
  // type (or `*`), which `emit` below does too, so a handler is only ever
  // called with the event it was written for.
  const handlers = (hook.events ?? {}) as Readonly<
    Record<string, StreamEventHook<HookEvent> | undefined>
  >;

  return {
    async emit(event: EveEvent): Promise<Emitted> {
      const before = cancels;
      eventCount += 1;

      const stamped: StampedEvent = {
        ...event,
        meta: { at: new Date(0).toISOString(), id: `evt_${eventCount}` },
      };

      await handlers[stamped.type]?.(stamped, ctx);
      await handlers["*"]?.(stamped, ctx);

      return { cancelled: cancels > before };
    },
  };
};
