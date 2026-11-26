/** The hosts a checkout's own Supabase stack answers on. */
const LOCAL_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"]);

/**
 * Whether `url` is a database on this machine, the only kind a job run by hand
 * may touch: the job deletes and backdates User data for good. An unset or
 * unreadable URL is not.
 */
export const isLocalDatabaseUrl = (url: string | undefined): boolean => {
  if (url === undefined || url === "") {
    return false;
  }

  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
};
