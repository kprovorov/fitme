import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { getAuthErrorMessage } from "~/components/auth/error";

export type AuthMethod =
  | "email"
  | "apple"
  | "google"
  | "verify"
  | "resend"
  | "restart";

let active: { method: AuthMethod; token: symbol } | null = null;
let routeRevision = 0;
let activeRoute: string | undefined;
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) {
    listener();
  }
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => active?.method ?? null;
const getActiveToken = () => active?.token;

export const invalidateAuthOperation = (pathname?: string) => {
  if (activeRoute !== pathname) {
    activeRoute = pathname;
    routeRevision += 1;
  }
};

const runAuthTask = async (
  task: (current: () => boolean) => Promise<string | undefined>,
  current: () => boolean,
  setError: (error: string | undefined) => void,
  token: symbol
) => {
  try {
    const message = await task(current);

    if (current()) {
      setError(message || undefined);
    }
  } catch (error_) {
    if (current()) {
      setError(getAuthErrorMessage(error_));
    }
  } finally {
    if (getActiveToken() === token) {
      active = null;
      notify();
    }
  }
};

/** Clerk has one mutable attempt per flow, shared by every auth screen. */
export const useAuthOperation = () => {
  const pending = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [error, setError] = useState<string | undefined>(undefined);
  const mounted = useRef<boolean>(true);
  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);
  const clearError = useCallback(() => setError(undefined), []);

  const run = useCallback(
    async (
      method: AuthMethod,
      task: (current: () => boolean) => Promise<string | undefined>
    ) => {
      if (active) {
        return;
      }

      const token = Symbol("auth-operation");
      const revision = routeRevision;
      active = { method, token };
      notify();
      setError(undefined);

      const current = () =>
        mounted.current &&
        revision === routeRevision &&
        getActiveToken() === token;

      await runAuthTask(task, current, setError, token);
    },
    []
  );

  return { clearError, error, pending, run };
};
