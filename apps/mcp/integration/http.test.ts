import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createTestUser, type TestUser } from "./setup.js";

const SSE_DATA_LINE = /^data: (.*)$/m;

/** The Hono app with its default, env-based Supabase client. */
describe("HTTP endpoint against Supabase", () => {
  const app = createApp({ logRequests: false });
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser("http");
  });

  const callTool = (name: string, token?: string) =>
    app.request("/", {
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "tools/call",
        params: { arguments: {}, name },
      }),
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      method: "POST",
    });

  const readResult = async (response: Response) => {
    const [, data] = (await response.text()).match(SSE_DATA_LINE) ?? [];
    const { result } = JSON.parse(data ?? "{}");
    return {
      isError: result.isError === true,
      text: String(result.content[0].text),
    };
  };

  it("verifies the bearer token and runs tools as that user", async () => {
    const response = await callTool("list_plans", user.accessToken);
    expect(response.status).toBe(200);
    expect(await readResult(response)).toEqual({ isError: false, text: "[]" });
  });

  it("answers a token Supabase did not issue with 401 invalid_token", async () => {
    const response = await callTool("list_plans", "not-a-real-token");
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain(
      'error="invalid_token"'
    );
  });

  it("answers a user tool call without a token with an OAuth challenge", async () => {
    const response = await callTool("list_plans");
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe(
      'Bearer resource_metadata="http://localhost/.well-known/oauth-protected-resource"'
    );
  });

  it("serves public tools without a token", async () => {
    const response = await callTool("ping");
    expect(response.status).toBe(200);
    expect((await readResult(response)).isError).toBe(false);
  });
});
