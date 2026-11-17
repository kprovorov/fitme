import type * as EveContext from "eve/context";
import { emptySessionView, foldEvents } from "eve/events";
import type { SessionView } from "eve/events";
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

/** An eve event as a hook receives it, and as a test writes it. */
export type EveEvent = HookEventMap[keyof HookEventMap];

/** What one commit did to the session's turn. */
export interface Emitted {
  /** A hook handler cancelled the running turn. */
  readonly cancelled: boolean;
}

const unavailableInTest = (): never => {
  throw new Error("This hook context has no runtime services");
};

const AT = new Date(0);

/**
 * One session a hook runs in: `emit` hands a commit (the events one state
 * change records, in order) to the hook as eve does. The session's view is
 * folded with the whole commit first, so each handler reads the commit's
 * later events in it, as in eve; then each event goes to the handler
 * subscribed to its type, then `*`. An event the hook doesn't subscribe to
 * does nothing, so a hook listening for a renamed event never fires and the
 * test expecting it fails.
 */
export const hookSession = (hook: HookDefinition, sessionId = "wrun_1") => {
  let cancels = 0;
  let line = 0;
  let view: SessionView = emptySessionView();

  // SAFETY: eve hands each event only to the handler keyed by that event's
  // type (or `*`), which `emit` below does too, so a handler is only ever
  // called with the event it was written for.
  const handlers = hook.events as Readonly<
    Record<string, StreamEventHook<HookEvent> | undefined>
  >;

  const contextAt = (index: number): HookContext => ({
    agent: { name: "arnold" },
    cancel: () => {
      cancels += 1;
    },
    channel: { kind: "channel:eve", metadata: {} },
    getSandbox: unavailableInTest,
    memo: unavailableInTest,
    now: AT,
    occurrence: {
      abortSignal: new AbortController().signal,
      idempotencyKey: `${sessionId}:${line}:${index}`,
    },
    position: { index, line },
    session: {
      auth: { current: null, initiator: null },
      id: sessionId,
      turn: { id: "turn_1", sequence: 1 },
    },
    turn: null,
    view,
  });

  return {
    async emit(...commit: readonly EveEvent[]): Promise<Emitted> {
      const before = cancels;

      view = foldEvents(
        view,
        commit.map((event, index) => ({
          ...event,
          meta: {
            at: AT.toISOString(),
            endOfLine: index === commit.length - 1,
            position: { index, line },
          },
        }))
      );

      for (const [index, event] of commit.entries()) {
        const ctx = contextAt(index);
        // oxlint-disable-next-line eslint/no-await-in-loop -- eve hands a commit's events to hooks in order.
        await handlers[event.type]?.(event, ctx);
        // oxlint-disable-next-line eslint/no-await-in-loop -- eve hands a commit's events to hooks in order.
        await handlers["*"]?.(event, ctx);
      }

      line += 1;

      return { cancelled: cancels > before };
    },
  };
};
