import { useEffect, useState } from "react";

/**
 * The current time in milliseconds, re-rendering every `intervalMs` while
 * `active`, for clocks that tick on screen.
 */
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!active) {
      return;
    }
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);

  return now;
}
