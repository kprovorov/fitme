import { useEffect, useState } from "react";

/**
 * The current time in milliseconds, re-rendering every `intervalMs` while
 * `active`, for clocks that tick on screen.
 */
export const useNow = (active: boolean, intervalMs = 1000): number => {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!active) {
      return;
    }

    const refreshTimer = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), intervalMs);

    return () => {
      clearTimeout(refreshTimer);
      clearInterval(timer);
    };
  }, [active, intervalMs]);

  return now;
};
