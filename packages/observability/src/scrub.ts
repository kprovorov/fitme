import { QUERY_FAILED_MESSAGE } from "./sanitize";

/**
 * The parts of an event (error or transaction) the scrubber touches. Typed
 * structurally so this module imports no SDK: Node, React Native and Next all
 * read it.
 */
export interface ScrubbableEvent {
  breadcrumbs?: { data?: unknown; message?: string }[];
  exception?: { values?: { value?: string }[] };
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
 * A failed Drizzle query's message (`Failed query: <SQL>\nparams: …`), bare or
 * anywhere inside a longer text (`Error: Failed query: …`, a logged error after
 * other arguments).
 */
const FAILED_QUERY = /\bFailed query:/;

const isFailedQuery = (text: unknown) =>
  typeof text === "string" && FAILED_QUERY.test(text);

/**
 * Every exception value of an event with a failed query: the others are its
 * cause chain (linked errors), whose Postgres message can echo input.
 */
const scrubException = (
  exception: NonNullable<ScrubbableEvent["exception"]>
) =>
  exception.values?.some(({ value }) => isFailedQuery(value))
    ? {
        ...exception,
        values: exception.values.map((value) => ({
          ...value,
          value: QUERY_FAILED_MESSAGE,
        })),
      }
    : exception;

const scrubBreadcrumbs = (
  breadcrumbs: NonNullable<ScrubbableEvent["breadcrumbs"]>
) =>
  breadcrumbs.map((breadcrumb) => {
    if (!isFailedQuery(breadcrumb.message)) {
      return breadcrumb;
    }
    const { data: _data, ...rest } = breadcrumb;
    return { ...rest, message: QUERY_FAILED_MESSAGE };
  });

/**
 * `beforeSend` / `beforeSendTransaction` for every app: no auth header,
 * cookie or request body ever leaves the process, and the user is reduced to
 * its id (the Clerk id); a user without one is dropped. A backstop for errors
 * reported around `reportError` (Sentry's own handlers, console breadcrumbs):
 * an event with an exception mentioning `Failed query:` has every exception value
 * replaced, and such a breadcrumb its message and data. Returns a
 * scrubbed copy.
 */
export const scrubEvent = <T extends object>(event: T): T => {
  const { breadcrumbs, exception, request, user, ...rest }: ScrubbableEvent =
    event;
  return {
    ...rest,
    ...(breadcrumbs && { breadcrumbs: scrubBreadcrumbs(breadcrumbs) }),
    ...(exception && { exception: scrubException(exception) }),
    ...(request && { request: scrubRequest(request) }),
    ...(user?.id !== undefined && { user: { id: user.id } }),
  } as T;
};
