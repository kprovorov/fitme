import { describe, expect, it, jest } from "@jest/globals";
import {
  ApiError,
  createPublicApi,
  type PublicApiFetch,
  rateLimitedFor,
} from "../api/client";

const BASE_URL = "https://api.test";

const answering = (response: () => Response) => {
  const fetch = jest.fn<PublicApiFetch>(async () => response());
  return fetch;
};

const clientWith = (
  fetch: PublicApiFetch,
  { baseUrl = BASE_URL, token = "session-token" } = {}
) =>
  createPublicApi({
    baseUrl: () => baseUrl,
    fetch,
    token: async () => token,
  });

const patchProfile = (api: ReturnType<typeof clientWith>) =>
  api().PATCH("/v1/profile", { body: { measurement_system: "us" } });

const rejection = async (promise: Promise<unknown>): Promise<ApiError> => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error("Expected the call to reject");
};

const errorResponse = (
  status: number,
  code: string,
  headers: HeadersInit = {}
) =>
  new Response(
    JSON.stringify({ error: { code, message: `${code} message` } }),
    { headers: { "Content-Type": "application/json", ...headers }, status }
  );

describe("createPublicApi", () => {
  it("sends the body and the session token as the bearer", async () => {
    const fetch = answering(() =>
      Response.json({ data: { measurement_system: "us" } })
    );

    const { data } = await patchProfile(clientWith(fetch));

    expect(data).toEqual({ data: { measurement_system: "us" } });
    const [url, init] = fetch.mock.calls[0] as Parameters<PublicApiFetch>;
    expect(url).toBe(`${BASE_URL}/v1/profile`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({
      measurement_system: "us",
    });
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer session-token"
    );
  });

  it("throws the API's code and message for an error answer", async () => {
    const error = await rejection(
      patchProfile(
        clientWith(answering(() => errorResponse(404, "profile_not_found")))
      )
    );

    expect(error).toMatchObject({
      code: "profile_not_found",
      message: "profile_not_found message",
      retryAfterSeconds: null,
      status: 404,
    });
  });

  it("carries Retry-After for a 429", async () => {
    const error = await rejection(
      patchProfile(
        clientWith(
          answering(() =>
            errorResponse(429, "rate_limited", { "Retry-After": "17" })
          )
        )
      )
    );

    expect(error).toMatchObject({ retryAfterSeconds: 17, status: 429 });
    expect(rateLimitedFor(error)).toBe(17);
  });

  it("waits a minute after a 429 whose Retry-After can't be read", async () => {
    const error = await rejection(
      patchProfile(
        clientWith(answering(() => errorResponse(429, "rate_limited")))
      )
    );

    expect(rateLimitedFor(error)).toBe(60);
  });

  it("throws the status for an answer that isn't the API's JSON", async () => {
    const error = await rejection(
      patchProfile(
        clientWith(answering(() => new Response("<html>", { status: 502 })))
      )
    );

    expect(error).toMatchObject({ code: null, status: 502 });
    expect(rateLimitedFor(error)).toBeNull();
  });

  it("throws for a network failure, with no status or code", async () => {
    const cause = new TypeError("Network request failed");
    const fetch = jest.fn<PublicApiFetch>(() => Promise.reject(cause));

    const error = await rejection(patchProfile(clientWith(fetch)));

    expect(error).toMatchObject({ code: null, status: null });
    expect(error.cause).toBe(cause);
  });

  it("throws for a token that can't be resolved, without a request", async () => {
    const fetch = answering(() => new Response(null, { status: 204 }));
    const api = createPublicApi({
      baseUrl: () => BASE_URL,
      fetch,
      token: () => Promise.reject(new Error("offline")),
    });

    const error = await rejection(patchProfile(api));

    expect(error).toMatchObject({ code: null, status: null });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws without a request when the base URL is unset", async () => {
    const fetch = answering(() => new Response(null, { status: 204 }));

    const error = await rejection(
      (async () => patchProfile(clientWith(fetch, { baseUrl: "" })))()
    );

    expect(error.status).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
