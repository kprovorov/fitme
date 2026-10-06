import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createTestUser, requireEnv, type TestUser } from "./setup.js";

const SSE_DATA_LINE = /^data: (.*)$/m;
const REDIRECT_URI = "http://127.0.0.1:8976/callback";
const RESOURCE = "http://localhost/";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

const base64Url = (bytes: Buffer) => bytes.toString("base64url");

/**
 * Runs the MCP authorization flow end to end against the local stack, the way
 * an MCP client does: discovery → dynamic registration → authorize (PKCE) →
 * consent (as the signed-in user) → token exchange → tool call → refresh.
 * Needs `[auth.oauth_server]` enabled with dynamic registration (config.toml).
 */
describe("OAuth against Supabase Auth", () => {
  const app = createApp({ logRequests: false });
  const { anonKey, url } = requireEnv();
  const authUrl = `${url}/auth/v1`;
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser("oauth");
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
    return { isError: result?.isError === true, status: response.status };
  };

  const postToken = async (params: Record<string, string>) => {
    const response = await fetch(`${authUrl}/oauth/token`, {
      body: new URLSearchParams(params),
      headers: {
        apikey: anonKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(
        `Token request failed (${response.status}): ${await response.text()}`
      );
    }
    return (await response.json()) as TokenResponse;
  };

  it("points clients at Supabase Auth, which serves the OAuth metadata", async () => {
    const resource = await app.request("/.well-known/oauth-protected-resource");
    const metadata = await resource.json();
    expect(metadata).toMatchObject({
      authorization_servers: [authUrl],
      resource: RESOURCE,
    });

    const issuer = new URL(metadata.authorization_servers[0]);
    const discovery = await fetch(
      `${issuer.origin}/.well-known/oauth-authorization-server${issuer.pathname}`
    );
    expect(discovery.status).toBe(200);
    expect(await discovery.json()).toMatchObject({
      authorization_endpoint: expect.any(String),
      registration_endpoint: expect.any(String),
      token_endpoint: expect.any(String),
    });
  });

  it("issues tokens that the user tools accept, and refreshes them", async () => {
    const registration = await fetch(`${authUrl}/oauth/clients/register`, {
      body: JSON.stringify({
        client_name: "MCP integration test",
        grant_types: ["authorization_code", "refresh_token"],
        redirect_uris: [REDIRECT_URI],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      method: "POST",
    });
    expect(registration.status, await registration.clone().text()).toBe(201);
    const { client_id: clientId } = await registration.json();

    const verifier = base64Url(randomBytes(32));
    const challenge = base64Url(createHash("sha256").update(verifier).digest());
    const authorize = new URL(`${authUrl}/oauth/authorize`);
    authorize.search = new URLSearchParams({
      client_id: clientId,
      code_challenge: challenge,
      code_challenge_method: "S256",
      redirect_uri: REDIRECT_URI,
      resource: RESOURCE,
      response_type: "code",
      state: "integration-state",
    }).toString();
    const authorization = await fetch(authorize, {
      headers: { apikey: anonKey },
      redirect: "manual",
    });
    expect(authorization.status).toBeGreaterThanOrEqual(300);
    expect(authorization.status).toBeLessThan(400);
    const consentUrl = new URL(authorization.headers.get("location") ?? "");
    expect(consentUrl.pathname).toBe("/oauth/consent");
    const authorizationId = consentUrl.searchParams.get("authorization_id");
    expect(authorizationId).toBeTruthy();

    // What apps/web's consent page does for the signed-in user.
    const details = await user.auth.auth.oauth.getAuthorizationDetails(
      authorizationId ?? ""
    );
    expect(details.error).toBeNull();
    expect(details.data).toMatchObject({
      client: { name: "MCP integration test" },
    });
    const approval = await user.auth.auth.oauth.approveAuthorization(
      authorizationId ?? "",
      { skipBrowserRedirect: true }
    );
    expect(approval.error).toBeNull();
    const callback = new URL(approval.data?.redirect_url ?? "");
    expect(callback.searchParams.get("state")).toBe("integration-state");
    const code = callback.searchParams.get("code") ?? "";

    const tokens = await postToken({
      client_id: clientId,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
      resource: RESOURCE,
    });
    expect(await callTool("list_plans", tokens.access_token)).toEqual({
      isError: false,
      status: 200,
    });

    const refreshed = await postToken({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    });
    expect(await callTool("get_profile", refreshed.access_token)).toEqual({
      isError: false,
      status: 200,
    });
  });
});
