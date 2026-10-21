/**
 * The parts of an event (error or transaction) the scrubber touches. Typed
 * structurally so this module imports no SDK: Node, React Native and Next all
 * read it.
 */
export interface ScrubbableEvent {
  request?: {
    cookies?: unknown;
    data?: unknown;
    headers?: Record<string, string>;
  };
  user?: { id?: string | number };
}

/** Headers that carry credentials, never sent in any form. */
export const SECRET_HEADERS = [
  "authorization",
  "cookie",
  "proxy-authorization",
  "set-cookie",
];

const scrubRequest = ({
  cookies: _cookies,
  data: _data,
  headers,
  ...request
}: NonNullable<ScrubbableEvent["request"]>) =>
  headers
    ? {
        ...request,
        headers: Object.fromEntries(
          Object.entries(headers).filter(
            ([name]) => !SECRET_HEADERS.includes(name.toLowerCase())
          )
        ),
      }
    : request;

/**
 * `beforeSend` / `beforeSendTransaction` for every app: no auth header,
 * cookie or request body ever leaves the process, and the user is reduced to
 * its id (the Clerk id); a user without one is dropped. Returns a scrubbed
 * copy.
 */
export const scrubEvent = <T extends object>(event: T): T => {
  const { request, user, ...rest }: ScrubbableEvent = event;
  return {
    ...rest,
    ...(request && { request: scrubRequest(request) }),
    ...(user?.id !== undefined && { user: { id: user.id } }),
  } as T;
};
