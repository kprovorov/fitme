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

  const callTool = async (name: string, token: string) => {
    const response = await app.request("/", {
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "tools/call",
        params: { arguments: {}, name },
      }),
      headers: {
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const [, data] = (await response.text()).match(SSE_DATA_LINE) ?? [];
    const { result } = JSON.parse(data ?? "{}");
    return {
      isError: result.isError === true,
      status: response.status,
      text: String(result.content[0].text),
    };
  };

  it("verifies the bearer token and runs tools as that user", async () => {
    const result = await callTool("list_plans", user.accessToken);
    expect(result).toEqual({ isError: false, status: 200, text: "[]" });
  });

  it("rejects a token Supabase did not issue", async () => {
    const result = await callTool("list_plans", "not-a-real-token");
    expect(result).toMatchObject({ isError: true, status: 200 });
    expect(result.text).toContain("Authentication failed");
  });
});
